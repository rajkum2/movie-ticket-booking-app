import { useEffect, useRef, useState } from "react";
import * as api from "../api";

const SUGGESTIONS = [
  "Recommend a feel-good film for tonight",
  "Compare Inception and Tenet",
  "What's a good thriller under 2 hours?",
  "Explain the ending of Interstellar (no spoilers please)",
];

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [useRag, setUseRag] = useState(false);
  const scrollerRef = useRef(null);
  const runRef = useRef({ cancelled: false });

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const appendToLast = (chunk) =>
    setMessages((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, content: last.content + chunk };
      return next;
    });

  const setSourcesOnLast = (sources) =>
    setMessages((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, sources };
      return next;
    });

  const setTraceIdOnLast = (traceId) =>
    setMessages((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, traceId };
      return next;
    });

  const setScoreOnLast = (traceId, score) =>
    setMessages((prev) =>
      prev.map((m) => (m.traceId === traceId ? { ...m, score } : m))
    );

  const send = async (text) => {
    const content = text.trim();
    if (!content || streaming) return;

    runRef.current.cancelled = true;
    const run = { cancelled: false };
    runRef.current = run;

    const history = [...messages, { role: "user", content }];
    setMessages([
      ...history,
      { role: "assistant", content: "", sources: null, traceId: null, score: null },
    ]);
    setInput("");
    setError(null);
    setStreaming(true);

    try {
      if (useRag) {
        const { traceId, stream } = await api.startRagChat(history);
        if (traceId) setTraceIdOnLast(traceId);
        for await (const event of stream) {
          if (run.cancelled) return;
          if (event.type === "sources") {
            setSourcesOnLast(event.sources);
          } else if (event.type === "delta") {
            appendToLast(event.content);
          }
        }
      } else {
        const { traceId, stream } = await api.startChat(history);
        if (traceId) setTraceIdOnLast(traceId);
        for await (const chunk of stream) {
          if (run.cancelled) return;
          appendToLast(chunk);
        }
      }
    } catch (e) {
      if (!run.cancelled) {
        setError(e.message);
        setMessages((prev) => prev.slice(0, -1));
      }
    } finally {
      if (!run.cancelled) setStreaming(false);
    }
  };

  const handleScore = async (traceId, value) => {
    if (!traceId) return;
    setScoreOnLast(traceId, value);
    try {
      await api.scoreTrace(traceId, value);
    } catch (e) {
      setScoreOnLast(traceId, null);
      setError(`Could not save feedback: ${e.message}`);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    send(input);
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send(input);
    }
  };

  const reset = () => {
    runRef.current.cancelled = true;
    setMessages([]);
    setError(null);
    setStreaming(false);
    setInput("");
  };

  return (
    <section className="chat">
      <header className="chat-head">
        <div>
          <h1 className="page-title" style={{ marginBottom: 4 }}>
            AI Chat
          </h1>
          <p className="chat-lede">
            Chat with CineBot — recommendations, summaries, comparisons, trivia.
          </p>
        </div>
        <div className="chat-head-actions">
          <label className="chat-toggle" title="Answer from your uploaded knowledge base">
            <input
              type="checkbox"
              checked={useRag}
              onChange={(e) => setUseRag(e.target.checked)}
              disabled={streaming}
            />
            <span>Ground in knowledge base</span>
          </label>
          {messages.length > 0 && (
            <button className="link-btn" onClick={reset} disabled={streaming}>
              New chat
            </button>
          )}
        </div>
      </header>

      <div className="chat-scroller" ref={scrollerRef}>
        {messages.length === 0 ? (
          <div className="chat-empty">
            <p>Try one of these to get started:</p>
            <div className="chat-suggestions">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="chat-suggestion"
                  onClick={() => send(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => {
            const isLast = i === messages.length - 1;
            return (
              <div key={i} className={`chat-msg chat-msg-${m.role}`}>
                <div className="chat-bubble">
                  {m.content || (streaming && isLast ? "…" : "")}
                  {streaming && isLast && m.content && (
                    <span className="chat-cursor">▍</span>
                  )}
                </div>
                {m.role === "assistant" && m.sources && m.sources.length > 0 && (
                  <div className="chat-sources">
                    <span className="chat-sources-label">Sources:</span>
                    {m.sources.map((s) => (
                      <span
                        key={`${s.document_id}-${s.chunk_index}`}
                        className="chat-source-chip"
                        title={`${s.snippet} (similarity ${s.similarity})`}
                      >
                        {s.title}
                      </span>
                    ))}
                  </div>
                )}
                {m.role === "assistant" && m.sources && m.sources.length === 0 && isLast && !streaming && (
                  <div className="chat-sources chat-sources-empty">
                    No matching entries in the knowledge base — answer is from general knowledge.
                  </div>
                )}
                {m.role === "assistant" && m.traceId && m.content && !(streaming && isLast) && (
                  <div className="chat-feedback">
                    <button
                      type="button"
                      className={`feedback-btn ${m.score === 1 ? "feedback-up" : ""}`}
                      onClick={() => handleScore(m.traceId, 1)}
                      disabled={m.score !== null && m.score !== undefined}
                      aria-label="Helpful"
                      title="Helpful"
                    >
                      👍
                    </button>
                    <button
                      type="button"
                      className={`feedback-btn ${m.score === 0 ? "feedback-down" : ""}`}
                      onClick={() => handleScore(m.traceId, 0)}
                      disabled={m.score !== null && m.score !== undefined}
                      aria-label="Not helpful"
                      title="Not helpful"
                    >
                      👎
                    </button>
                    {m.score !== null && m.score !== undefined && (
                      <span className="feedback-thanks">Thanks for the feedback</span>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {error && <p className="status error">⚠️ {error}</p>}

      <form className="chat-form" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            useRag ? "Ask about your uploaded docs..." : "Ask about a movie..."
          }
          rows={1}
          disabled={streaming}
        />
        <button
          type="submit"
          className="primary-btn"
          disabled={streaming || !input.trim()}
        >
          {streaming ? "…" : "Send"}
        </button>
      </form>
    </section>
  );
}
