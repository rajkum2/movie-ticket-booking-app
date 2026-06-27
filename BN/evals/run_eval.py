#!/usr/bin/env python3
"""CineBook evaluation harness.

Two suites:
  * rag   — Layer 2 (RAG Chat) "RAG triad": retrieval hit (deterministic) +
            context relevance, groundedness, answer relevance (LLM-as-judge).
  * agent — Layer 3a (read agent): tool-call accuracy + safety (deterministic).

It is intentionally dependency-free (Python stdlib only). It calls the LIVE
deployed API for the system-under-test and uses DeepSeek directly as the judge.

Run:
    export DEEPSEEK_API_KEY=sk-...            # for the LLM judge (rag suite)
    python3 evals/run_eval.py --suite all     # or: rag | agent

Optional env:
    CINEBOOK_API   (default: the Railway prod URL)
    CINEBOOK_EMAIL / CINEBOOK_PASSWORD  (default: the demo admin)
"""
import argparse
import json
import os
import sys
import urllib.error
import urllib.request

BASE = os.environ.get(
    "CINEBOOK_API",
    "https://movie-ticket-booking-app-production-109b.up.railway.app",
)
EMAIL = os.environ.get("CINEBOOK_EMAIL", "admin@cinebook.com")
PASSWORD = os.environ.get("CINEBOOK_PASSWORD", "admin123")
DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY")
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"
DEEPSEEK_MODEL = "deepseek-chat"

PASS_THRESHOLD = 0.7  # a triad judge score >= this counts as a pass


# ---------------------------------------------------------------------------
# Tiny HTTP helpers (stdlib only)
# ---------------------------------------------------------------------------
def _post(url, body, token=None, timeout=90):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(
        url, data=json.dumps(body).encode(), headers=headers, method="POST"
    )
    return urllib.request.urlopen(req, timeout=timeout)


def login():
    resp = _post(f"{BASE}/auth/login", {"email": EMAIL, "password": PASSWORD}, timeout=30)
    return json.load(resp)["token"]


def stream_events(path, body, token):
    """Yield parsed NDJSON event dicts from a streaming endpoint."""
    resp = _post(f"{BASE}{path}", body, token)
    for raw in resp:
        line = raw.decode("utf-8").strip()
        if not line:
            continue
        try:
            yield json.loads(line)
        except json.JSONDecodeError:
            continue


# ---------------------------------------------------------------------------
# LLM-as-judge (DeepSeek, JSON mode, temperature 0)
# ---------------------------------------------------------------------------
def judge(system_prompt, user_content):
    if not DEEPSEEK_KEY:
        sys.exit("DEEPSEEK_API_KEY is required for the rag suite (the LLM judge).")
    body = {
        "model": DEEPSEEK_MODEL,
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_content},
        ],
    }
    req = urllib.request.Request(
        DEEPSEEK_URL,
        data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {DEEPSEEK_KEY}"},
        method="POST",
    )
    resp = urllib.request.urlopen(req, timeout=60)
    content = json.load(resp)["choices"][0]["message"]["content"]
    return json.loads(content)


CTX_JUDGE = (
    "You grade a RETRIEVAL system for a cinema help assistant. Given a QUERY and "
    "the SNIPPETS retrieved for it, rate how relevant the snippets are to "
    "answering the query (1.0 = directly relevant, 0.0 = irrelevant). If the "
    "query is general trivia unrelated to the cinema and NO snippets were "
    "retrieved, that is correct behaviour — score 1.0. "
    'Return JSON: {"score": <0..1>, "reason": "..."}'
)
GRND_JUDGE = (
    "You grade GROUNDEDNESS. SNIPPETS are the only allowed source. Decide whether "
    "every factual claim in the ANSWER is supported by the SNIPPETS (1.0 = fully "
    "grounded, 0.0 = fabricated). If the ANSWER explicitly says the info is not in "
    "the knowledge base and clearly flags any general knowledge as such, do not "
    'penalize. Return JSON: {"score": <0..1>, "unsupported": ["..."], "reason": "..."}'
)
REL_JUDGE = (
    "You grade ANSWER RELEVANCE. Given a QUERY and an ANSWER, rate how well the "
    "answer addresses the question (ignore factual correctness; judge relevance "
    'only). Return JSON: {"score": <0..1>, "reason": "..."}'
)


# ---------------------------------------------------------------------------
# RAG suite (Layer 2) — the RAG triad
# ---------------------------------------------------------------------------
def run_rag(token, cases):
    rows = []
    for c in cases:
        sources, answer = [], []
        for ev in stream_events("/chat/rag", {"messages": [{"role": "user", "content": c["query"]}]}, token):
            if ev.get("type") == "sources":
                sources = ev.get("sources", [])
            elif ev.get("type") == "delta":
                answer.append(ev.get("content", ""))
        ans = "".join(answer).strip()
        titles = [s.get("title") for s in sources]
        snippets = "\n".join(f"[{s.get('title')}] {s.get('snippet')}" for s in sources) or "(no snippets retrieved)"

        # Deterministic retrieval hit
        if c.get("expected_doc"):
            hit = c["expected_doc"] in titles
        else:
            hit = len(sources) == 0  # off-topic should retrieve nothing

        ctx = judge(CTX_JUDGE, f"QUERY: {c['query']}\n\nSNIPPETS:\n{snippets}")
        grnd = judge(GRND_JUDGE, f"SNIPPETS:\n{snippets}\n\nANSWER:\n{ans}")
        rel = judge(REL_JUDGE, f"QUERY: {c['query']}\n\nANSWER:\n{ans}")

        rows.append({
            "id": c["id"],
            "hit": hit,
            "context_relevance": float(ctx.get("score", 0)),
            "groundedness": float(grnd.get("score", 0)),
            "answer_relevance": float(rel.get("score", 0)),
            "sources": titles,
        })
        last = rows[-1]
        flag = "PASS" if (last["hit"] and min(last["context_relevance"], last["groundedness"], last["answer_relevance"]) >= PASS_THRESHOLD) else "FAIL"
        print(f"  [{flag}] {c['id']:<16} hit={hit!s:<5} ctx={last['context_relevance']:.2f} grnd={last['groundedness']:.2f} rel={last['answer_relevance']:.2f}  src={titles}")
    return rows


def report_rag(rows):
    n = len(rows)
    if not n:
        return
    hit_rate = sum(r["hit"] for r in rows) / n
    avg = lambda k: sum(r[k] for r in rows) / n
    passed = sum(
        1 for r in rows
        if r["hit"] and min(r["context_relevance"], r["groundedness"], r["answer_relevance"]) >= PASS_THRESHOLD
    )
    print("\n  ── RAG triad summary ──")
    print(f"  cases:               {n}")
    print(f"  retrieval hit rate:  {hit_rate:.0%}")
    print(f"  avg context relev.:  {avg('context_relevance'):.2f}")
    print(f"  avg groundedness:    {avg('groundedness'):.2f}")
    print(f"  avg answer relev.:   {avg('answer_relevance'):.2f}")
    print(f"  overall pass:        {passed}/{n} ({passed/n:.0%})")


# ---------------------------------------------------------------------------
# Agent suite (Layer 3a) — tool-call accuracy + safety (deterministic)
# ---------------------------------------------------------------------------
def run_agent(token, cases):
    rows = []
    for c in cases:
        called, answer = [], []
        for ev in stream_events("/chat/agent", {"messages": [{"role": "user", "content": c["query"]}]}, token):
            if ev.get("type") == "tool_call":
                called.append(ev.get("name"))
            elif ev.get("type") == "delta":
                answer.append(ev.get("content", ""))
        ans = "".join(answer).strip().lower()
        called_set = set(called)

        # Tool-call accuracy
        need_all = set(c.get("expected_all", []))
        need_any = set(c.get("expected_any", []))
        tool_ok = need_all.issubset(called_set) and (not need_any or bool(need_any & called_set))

        # Safety / behaviour (substring checks)
        forb = [s for s in c.get("forbidden_substrings", []) if s.lower() in ans]
        missing = [s for s in c.get("required_substrings", []) if s.lower() not in ans]
        safe = not forb and not missing

        ok = tool_ok and safe
        rows.append({"id": c["id"], "tool_ok": tool_ok, "safe": safe, "called": called})
        print(f"  [{'PASS' if ok else 'FAIL'}] {c['id']:<16} tools={tool_ok!s:<5} safe={safe!s:<5} called={called}"
              + (f"  ⚠ forbidden={forb}" if forb else "")
              + (f"  ⚠ missing={missing}" if missing else ""))
    return rows


def report_agent(rows):
    n = len(rows)
    if not n:
        return
    tool_rate = sum(r["tool_ok"] for r in rows) / n
    safe_rate = sum(r["safe"] for r in rows) / n
    passed = sum(1 for r in rows if r["tool_ok"] and r["safe"])
    print("\n  ── Agent summary ──")
    print(f"  cases:               {n}")
    print(f"  tool-call accuracy:  {tool_rate:.0%}")
    print(f"  safety pass rate:    {safe_rate:.0%}")
    print(f"  overall pass:        {passed}/{n} ({passed/n:.0%})")


# ---------------------------------------------------------------------------
def load(name):
    here = os.path.dirname(os.path.abspath(__file__))
    with open(os.path.join(here, name)) as f:
        return json.load(f)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--suite", choices=["rag", "agent", "all"], default="all")
    args = ap.parse_args()

    print(f"API: {BASE}")
    token = login()

    if args.suite in ("rag", "all"):
        print("\n=== RAG triad (Layer 2) ===")
        report_rag(run_rag(token, load("dataset_rag.json")))

    if args.suite in ("agent", "all"):
        print("\n=== Agent tool-accuracy + safety (Layer 3a) ===")
        report_agent(run_agent(token, load("dataset_agent.json")))


if __name__ == "__main__":
    try:
        main()
    except urllib.error.HTTPError as e:
        sys.exit(f"HTTP {e.code}: {e.read().decode()[:300]}")
