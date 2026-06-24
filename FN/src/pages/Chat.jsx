import { useEffect, useRef, useState } from "react";
import * as api from "../api";

const SUGGESTIONS = [
  "Recommend a feel-good film for tonight",
  "Compare Inception and Tenet",
  "What's a good thriller under 2 hours?",
  "Explain the ending of Interstellar (no spoilers please)",
];

// Shown when the Tool use capability is enabled — these exercise the tools.
const AGENT_SUGGESTIONS = [
  "What action movies are in the catalog right now?",
  "When's the next showtime for The Dark Knight?",
  "Are there seats free for Inception's evening show?",
  "What have I booked so far?",
];

// Shown when the "Book with AI" capability is on — these exercise actions.
const BOOK_SUGGESTIONS = [
  "Book me 2 seats for the 9pm show of Interstellar",
  "What's free for The Dark Knight tonight? Then book me one seat",
  "I want 3 seats for Inception this evening",
  "Cancel my most recent booking",
];

// Friendly labels for the grey tool-activity rows.
const TOOL_LABELS = {
  search_movies: "Searched the catalog",
  get_movie_details: "Looked up movie details",
  get_showtimes: "Checked showtimes",
  get_seat_availability: "Checked seat availability",
  get_my_bookings: "Looked up your bookings",
  current_datetime: "Checked the current date/time",
  propose_booking: "Prepared a booking",
  propose_cancellation: "Prepared a cancellation",
};

export default function Chat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState(null);
  const [mode, setMode] = useState("chat"); // "chat" | "rag" | "tools" | "book"
  const [toolsEnabled, setToolsEnabled] = useState(false);
  const [writeEnabled, setWriteEnabled] = useState(false);
  const scrollerRef = useRef(null);
  const runRef = useRef({ cancelled: false });

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, streaming]);

  // Discover which capabilities the admin has turned on. The `tools` flag
  // routes chat through the agentic /chat/agent endpoint.
  useEffect(() => {
    let alive = true;
    api
      .getFeatureFlags()
      .then((flags) => {
        if (!alive) return;
        const tools = flags.find((f) => f.key === "tools");
        const write = flags.find((f) => f.key === "tools_write");
        const enabled = Boolean(tools && tools.enabled);
        const writeOn = Boolean(write && write.enabled);
        setToolsEnabled(enabled);
        setWriteEnabled(writeOn);
        // Default to the most capable enabled mode (book > tools > chat).
        if (writeOn) setMode((m) => (m === "chat" ? "book" : m));
        else if (enabled) setMode((m) => (m === "chat" ? "tools" : m));
      })
      .catch(() => {
        /* flags unreadable — stay on baseline chat */
      });
    return () => {
      alive = false;
    };
  }, []);

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

  // Append a tool call to the last (assistant) message, with no result yet.
  const addToolCall = (name, args) =>
    setMessages((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      const events = [...(last.toolEvents || []), { name, args, summary: null }];
      next[next.length - 1] = { ...last, toolEvents: events };
      return next;
    });

  // Attach a result summary to the most recent pending call of that tool.
  const setToolResult = (name, summary) =>
    setMessages((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      const events = [...(last.toolEvents || [])];
      for (let i = events.length - 1; i >= 0; i--) {
        if (events[i].name === name && events[i].summary === null) {
          events[i] = { ...events[i], summary };
          break;
        }
      }
      next[next.length - 1] = { ...last, toolEvents: events };
      return next;
    });

  // Attach a pending confirmation (from a confirm_request event) to the last
  // assistant message; the UI renders it as a Confirm/Cancel card.
  const setConfirmOnLast = (confirm) =>
    setMessages((prev) => {
      const next = prev.slice();
      const last = next[next.length - 1];
      next[next.length - 1] = { ...last, confirm };
      return next;
    });

  const updateConfirm = (idx, patch) =>
    setMessages((prev) =>
      prev.map((m, i) =>
        i === idx ? { ...m, confirm: { ...m.confirm, ...patch } } : m
      )
    );

  const send = async (text) => {
    const content = text.trim();
    if (!content || streaming) return;

    runRef.current.cancelled = true;
    const run = { cancelled: false };
    runRef.current = run;

    // The selected mode picks the endpoint: knowledge base (RAG), the action
    // agent (book), the read-only tool agent, or plain chat. The agent modes
    // only route to their endpoints when the matching capability is enabled.
    const useRag = mode === "rag";
    const useBook = mode === "book" && writeEnabled;
    const useAgent = mode === "tools" && toolsEnabled;

    const history = [...messages, { role: "user", content }];
    setMessages([
      ...history,
      {
        role: "assistant",
        content: "",
        sources: null,
        traceId: null,
        score: null,
        toolEvents: [],
      },
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
      } else if (useBook) {
        const { traceId, stream } = await api.startAdvancedAgentChat(history);
        if (traceId) setTraceIdOnLast(traceId);
        for await (const event of stream) {
          if (run.cancelled) return;
          if (event.type === "tool_call") {
            addToolCall(event.name, event.args);
          } else if (event.type === "tool_result") {
            setToolResult(event.name, event.summary);
          } else if (event.type === "delta") {
            appendToLast(event.content);
          } else if (event.type === "confirm_request") {
            setConfirmOnLast({
              action: event.action,
              args: event.args,
              summary: event.summary,
              status: "pending",
            });
          }
        }
      } else if (useAgent) {
        const { traceId, stream } = await api.startAgentChat(history);
        if (traceId) setTraceIdOnLast(traceId);
        for await (const event of stream) {
          if (run.cancelled) return;
          if (event.type === "tool_call") {
            addToolCall(event.name, event.args);
          } else if (event.type === "tool_result") {
            setToolResult(event.name, event.summary);
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

  // Confirm a proposed action — the ONLY place a write is triggered. The
  // server re-validates everything, so a stale proposal fails safely (e.g. 409).
  const handleConfirmAction = async (idx) => {
    const confirm = messages[idx]?.confirm;
    if (!confirm || confirm.status !== "pending" || streaming) return;
    updateConfirm(idx, { status: "executing" });
    try {
      const res = await api.executeAgentAction(confirm.action, confirm.args);
      updateConfirm(idx, { status: "done" });
      let note = "✅ Done.";
      if (confirm.action === "create_booking" && res.booking) {
        const b = res.booking;
        note = `✅ Booked! Confirmation #${b.id} — ${(b.seats || []).join(
          ", "
        )} for ${b.movie_title || "movie " + b.movie_id} at ${b.showtime}. Total $${Number(
          b.total_amount
        ).toFixed(2)}.`;
      } else if (confirm.action === "cancel_booking") {
        note = `✅ Cancelled booking #${confirm.args.booking_id}. Your seats are freed.`;
      }
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: note,
          sources: null,
          traceId: null,
          score: null,
          toolEvents: [],
        },
      ]);
    } catch (e) {
      updateConfirm(idx, { status: "error", error: e.message });
    }
  };

  const handleDeclineAction = (idx) => updateConfirm(idx, { status: "declined" });

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
          <div className="chat-modes" role="tablist" aria-label="Chat mode">
            <button
              type="button"
              role="tab"
              aria-selected={mode === "chat"}
              className={`chat-mode ${mode === "chat" ? "active" : ""}`}
              onClick={() => setMode("chat")}
              disabled={streaming}
              title="Standard movie chat from general knowledge"
            >
              💬 Chat
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === "rag"}
              className={`chat-mode ${mode === "rag" ? "active" : ""}`}
              onClick={() => setMode("rag")}
              disabled={streaming}
              title="Answer from your uploaded knowledge base"
            >
              📚 Knowledge base
            </button>
            {toolsEnabled && (
              <button
                type="button"
                role="tab"
                aria-selected={mode === "tools"}
                className={`chat-mode ${mode === "tools" ? "active" : ""}`}
                onClick={() => setMode("tools")}
                disabled={streaming}
                title="CineBot uses read-only tools (catalog, showtimes, seats, your bookings) to answer from live data"
              >
                ⚡ Tools
              </button>
            )}
            {writeEnabled && (
              <button
                type="button"
                role="tab"
                aria-selected={mode === "book"}
                className={`chat-mode ${mode === "book" ? "active" : ""}`}
                onClick={() => setMode("book")}
                disabled={streaming}
                title="CineBot can complete bookings and cancellations — every action needs your confirmation first"
              >
                🎟️ Book with AI
              </button>
            )}
          </div>
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
              {(mode === "book"
                ? BOOK_SUGGESTIONS
                : mode === "tools"
                ? AGENT_SUGGESTIONS
                : SUGGESTIONS
              ).map((s) => (
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
                {m.role === "assistant" &&
                  m.toolEvents &&
                  m.toolEvents.length > 0 && (
                    <div className="chat-tool-events">
                      {m.toolEvents.map((ev, j) => (
                        <div key={j} className="chat-tool-row">
                          <span className="chat-tool-icon">🔧</span>
                          <span className="chat-tool-label">
                            {TOOL_LABELS[ev.name] || ev.name}
                          </span>
                          <span className="chat-tool-summary">
                            {ev.summary ? `— ${ev.summary}` : "…"}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                {(m.content || (streaming && isLast)) && (
                  <div className="chat-bubble">
                    {m.content || "…"}
                    {streaming && isLast && m.content && (
                      <span className="chat-cursor">▍</span>
                    )}
                  </div>
                )}
                {m.role === "assistant" && m.confirm && (
                  <div className="chat-confirm">
                    <div className="chat-confirm-summary">
                      <span className="chat-confirm-icon">
                        {m.confirm.action === "cancel_booking" ? "🗑️" : "🎟️"}
                      </span>
                      {m.confirm.summary}
                    </div>
                    {m.confirm.status === "pending" && (
                      <div className="chat-confirm-actions">
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => handleConfirmAction(i)}
                        >
                          Confirm
                        </button>
                        <button
                          type="button"
                          className="link-btn"
                          onClick={() => handleDeclineAction(i)}
                        >
                          Cancel
                        </button>
                      </div>
                    )}
                    {m.confirm.status === "executing" && (
                      <div className="chat-confirm-status">Processing…</div>
                    )}
                    {m.confirm.status === "done" && (
                      <div className="chat-confirm-status done">✅ Confirmed</div>
                    )}
                    {m.confirm.status === "declined" && (
                      <div className="chat-confirm-status">
                        Cancelled — nothing was changed.
                      </div>
                    )}
                    {m.confirm.status === "error" && (
                      <div className="chat-confirm-status error">
                        ⚠️ {m.confirm.error}
                      </div>
                    )}
                  </div>
                )}
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
            mode === "rag"
              ? "Ask about your uploaded docs..."
              : "Ask about a movie..."
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
