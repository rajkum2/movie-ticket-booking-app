"""Retrieval-Augmented Generation (RAG) helpers.

Pipeline:
    file/text -> extract_text -> chunk_text -> embed_texts (Jina) -> insert into rag_chunks
    user query -> embed_texts (Jina) -> match_rag_chunks (pgvector) -> build_rag_messages

Embeddings live in our own Postgres (Supabase) — Jina is just the stateless
service that converts text to vectors. Nothing is stored at Jina.
"""
from __future__ import annotations

import io
import logging
import os
from typing import List, Optional

import httpx

from database import get_supabase
from observability import get_prompt


log = logging.getLogger("uvicorn.error")


JINA_API_URL = "https://api.jina.ai/v1/embeddings"
JINA_MODEL = "jina-embeddings-v3"
EMBEDDING_DIM = 1024

CHUNK_SIZE = 800
CHUNK_OVERLAP = 120
MAX_DOC_BYTES = 5 * 1024 * 1024  # 5 MB
EMBED_BATCH_SIZE = 64


# ---------------------------------------------------------------------------
# Text extraction
# ---------------------------------------------------------------------------
def extract_text(data: bytes, filename: Optional[str], content_type: Optional[str]) -> str:
    """Pull plain text out of an uploaded file (.txt / .pdf / .docx)."""
    name = (filename or "").lower()
    ct = (content_type or "").lower()

    if name.endswith(".pdf") or ct == "application/pdf":
        return _extract_pdf(data)

    if name.endswith(".docx") or ct in (
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ):
        return _extract_docx(data)

    # Default: treat anything else as UTF-8 text.
    return data.decode("utf-8", errors="ignore")


def _extract_pdf(data: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(data))
    parts = []
    for page in reader.pages:
        try:
            parts.append(page.extract_text() or "")
        except Exception as exc:
            log.warning("PDF page extraction failed: %s", exc)
    return "\n\n".join(p.strip() for p in parts if p and p.strip())


def _extract_docx(data: bytes) -> str:
    from docx import Document

    doc = Document(io.BytesIO(data))
    return "\n\n".join(p.text for p in doc.paragraphs if p.text and p.text.strip())


# ---------------------------------------------------------------------------
# Chunking
# ---------------------------------------------------------------------------
def chunk_text(text: str, size: int = CHUNK_SIZE, overlap: int = CHUNK_OVERLAP) -> List[str]:
    text = (text or "").strip()
    if not text:
        return []
    if len(text) <= size:
        return [text]

    chunks: List[str] = []
    start = 0
    n = len(text)
    while start < n:
        end = min(start + size, n)
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        if end >= n:
            break
        start = end - overlap
    return chunks


# ---------------------------------------------------------------------------
# Embeddings (Jina, stateless)
# ---------------------------------------------------------------------------
def embed_texts(texts: List[str], task: str = "retrieval.passage") -> List[List[float]]:
    """Convert a batch of strings into vectors via Jina's embedding API.

    task: "retrieval.passage" for documents, "retrieval.query" for user queries.
    """
    if not texts:
        return []
    key = os.environ.get("JINA_API_KEY")
    if not key:
        raise RuntimeError("JINA_API_KEY is not set")

    out: List[List[float]] = []
    for i in range(0, len(texts), EMBED_BATCH_SIZE):
        batch = texts[i : i + EMBED_BATCH_SIZE]
        resp = httpx.post(
            JINA_API_URL,
            headers={
                "Authorization": f"Bearer {key}",
                "Content-Type": "application/json",
            },
            json={
                "model": JINA_MODEL,
                "task": task,
                "input": batch,
            },
            timeout=60.0,
        )
        resp.raise_for_status()
        data = resp.json().get("data", [])
        out.extend(item["embedding"] for item in data)
    return out


# ---------------------------------------------------------------------------
# Ingest
# ---------------------------------------------------------------------------
def ingest_document(title: str, body: str, uploaded_by: Optional[int], source: Optional[str]) -> dict:
    chunks = chunk_text(body)
    if not chunks:
        raise ValueError("Document is empty after extraction")

    vectors = embed_texts(chunks, task="retrieval.passage")
    if len(vectors) != len(chunks):
        raise RuntimeError("Embedding count mismatch from Jina response")

    sb = get_supabase()
    doc_row = (
        sb.table("rag_documents")
        .insert({"title": title, "source": source, "uploaded_by": uploaded_by})
        .execute()
    )
    if not doc_row.data:
        raise RuntimeError("Failed to create rag_documents row")
    doc = doc_row.data[0]

    rows = [
        {
            "document_id": doc["id"],
            "chunk_index": idx,
            "content": chunk,
            "embedding": vector,
        }
        for idx, (chunk, vector) in enumerate(zip(chunks, vectors))
    ]
    sb.table("rag_chunks").insert(rows).execute()

    return {"id": doc["id"], "title": doc["title"], "chunk_count": len(chunks)}


# ---------------------------------------------------------------------------
# Retrieval + prompt assembly
# ---------------------------------------------------------------------------
def retrieve(query: str, k: int = 5, threshold: float = 0.4) -> List[dict]:
    query = (query or "").strip()
    if not query:
        return []
    vecs = embed_texts([query], task="retrieval.query")
    if not vecs:
        return []
    sb = get_supabase()
    res = sb.rpc(
        "match_rag_chunks",
        {
            "query_embedding": vecs[0],
            "match_threshold": threshold,
            "match_count": k,
        },
    ).execute()
    chunks = res.data or []
    if not chunks:
        return []

    doc_ids = list({c["document_id"] for c in chunks})
    titles_res = (
        sb.table("rag_documents").select("id,title").in_("id", doc_ids).execute()
    )
    titles = {d["id"]: d["title"] for d in (titles_res.data or [])}
    for c in chunks:
        c["document_title"] = titles.get(c["document_id"], "Unknown")
    return chunks


def build_rag_system_prompt(retrieved_chunks: List[dict]) -> tuple[str, Optional[object]]:
    """Compose the system prompt for a RAG chat turn.

    Returns (text, prompt_object_or_None). The prompt object — when
    available — should be passed as `langfuse_prompt=` to the OpenAI
    wrapper so the trace is linked to the exact preamble version used.
    """
    preamble, prompt_obj = get_prompt("rag-grounding-preamble")
    if not retrieved_chunks:
        body = "\n\nCONTEXT:\n(No relevant entries found in the knowledge base.)"
    else:
        context = "\n\n---\n\n".join(
            f"[{c['document_title']}]\n{c['content']}" for c in retrieved_chunks
        )
        body = f"\n\nCONTEXT:\n{context}"
    return preamble + body, prompt_obj
