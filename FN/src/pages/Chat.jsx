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
  const scrollerRef = useRef(null);
  const runRef = useRef({ cancelled: false });

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  const send = async (text) => {
    const content = text.trim();
    if (!content || streaming) return;

    runRef.current.cancelled = true;
    const run = { cancelled: false };
    runRef.current = run;

    const history = [...messages, { role: "user", content }];
    setMessages([...history, { role: "assistant", content: "" }]);
    setInput("");
    setError(null);
    setStreaming(true);

    try {
      for await (const chunk of api.streamChat(history)) {
        if (run.cancelled) return;
        setMessages((prev) => {
          const next = prev.slice();
          const last = next[next.length - 1];
          next[next.length - 1] = { ...last, content: last.content + chunk };
          return next;
        });
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
        {messages.length > 0 && (
          <button className="link-btn" onClick={reset} disabled={streaming}>
            New chat
          </button>
        )}
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
          messages.map((m, i) => (
            <div key={i} className={`chat-msg chat-msg-${m.role}`}>
              <div className="chat-bubble">
                {m.content || (streaming && i === messages.length - 1 ? "…" : "")}
                {streaming && i === messages.length - 1 && m.content && (
                  <span className="chat-cursor">▍</span>
                )}
              </div>
            </div>
          ))
        )}
      </div>

      {error && <p className="status error">⚠️ {error}</p>}

      <form className="chat-form" onSubmit={handleSubmit}>
        <textarea
          className="chat-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask about a movie..."
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
