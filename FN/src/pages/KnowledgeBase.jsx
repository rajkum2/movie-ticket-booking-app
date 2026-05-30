import { useEffect, useRef, useState } from "react";
import * as api from "../api";

export default function KnowledgeBase() {
  const [docs, setDocs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(null);
  const fileInputRef = useRef(null);

  const refresh = async () => {
    setLoading(true);
    try {
      const data = await api.listDocuments();
      setDocs(data);
      setError(null);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim()) {
      setError("Title is required");
      return;
    }
    if (!text.trim() && !file) {
      setError("Paste text or choose a file");
      return;
    }
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      const result = await api.uploadDocument({
        title: title.trim(),
        text: text.trim() || undefined,
        file: file || undefined,
      });
      setSuccess(`Ingested ${result.chunk_count} chunks from “${result.title}”`);
      setTitle("");
      setText("");
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      refresh();
    } catch (e) {
      setError(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (doc) => {
    if (!window.confirm(`Delete “${doc.title}” and all its chunks?`)) return;
    try {
      await api.deleteDocument(doc.id);
      refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <section className="kb">
      <h1 className="page-title">Knowledge Base</h1>
      <p className="kb-lede">
        Add resources (text, .txt, .pdf, .docx) so the AI Chat can answer
        questions grounded in your material.
      </p>

      <form className="kb-form" onSubmit={handleSubmit}>
        <label className="kb-label">
          Title
          <input
            type="text"
            className="kb-input"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Interstellar production notes"
            required
          />
        </label>

        <label className="kb-label">
          Paste text
          <textarea
            className="kb-textarea"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Paste content here (or use the file picker below)"
            rows={6}
          />
        </label>

        <label className="kb-label">
          Or upload a file
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.pdf,.docx,text/plain,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            onChange={(e) => setFile(e.target.files?.[0] || null)}
            className="kb-file"
          />
          {file && (
            <span className="kb-filename">
              {file.name} ({Math.round(file.size / 1024)} KB)
            </span>
          )}
        </label>

        {error && <p className="status error">⚠️ {error}</p>}
        {success && <p className="status success">✓ {success}</p>}

        <button
          type="submit"
          className="primary-btn"
          disabled={submitting}
        >
          {submitting ? "Ingesting…" : "Add to knowledge base"}
        </button>
      </form>

      <h2 className="kb-subheading">Documents</h2>
      {loading ? (
        <p className="status">Loading…</p>
      ) : docs.length === 0 ? (
        <p className="status">No documents yet — add one above.</p>
      ) : (
        <ul className="kb-list">
          {docs.map((d) => (
            <li key={d.id} className="kb-item">
              <div>
                <strong>{d.title}</strong>
                <div className="kb-meta">
                  {d.chunk_count} chunks · {d.source || "—"} ·{" "}
                  {new Date(d.created_at).toLocaleString()}
                </div>
              </div>
              <button
                type="button"
                className="link-btn kb-delete"
                onClick={() => handleDelete(d)}
              >
                Delete
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
