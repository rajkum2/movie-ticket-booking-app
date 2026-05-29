import { useEffect, useRef, useState } from "react";
import { parseSearchQuery } from "../api";

const SpeechRecognitionImpl =
  typeof window !== "undefined" &&
  (window.SpeechRecognition || window.webkitSpeechRecognition);

export const voiceSearchSupported = Boolean(SpeechRecognitionImpl);

export default function VoiceSearchButton({ onParsed, onTranscript, lang = "en-US" }) {
  const [listening, setListening] = useState(false);
  const [parsing, setParsing] = useState(false);
  const [error, setError] = useState(null);
  const recognitionRef = useRef(null);

  useEffect(() => () => recognitionRef.current?.abort?.(), []);

  if (!voiceSearchSupported) return null;

  const handleClick = () => {
    setError(null);

    if (listening) {
      recognitionRef.current?.stop();
      return;
    }

    const rec = new SpeechRecognitionImpl();
    rec.lang = lang;
    rec.interimResults = false;
    rec.maxAlternatives = 1;
    recognitionRef.current = rec;

    rec.onstart = () => setListening(true);
    rec.onerror = (e) => {
      setListening(false);
      const msg =
        e.error === "not-allowed"
          ? "Microphone permission denied"
          : e.error === "no-speech"
          ? "Didn't catch that — try again"
          : `Speech error: ${e.error}`;
      setError(msg);
    };
    rec.onend = () => setListening(false);
    rec.onresult = async (e) => {
      const transcript = e.results?.[0]?.[0]?.transcript?.trim();
      if (!transcript) return;
      onTranscript?.(transcript);

      setParsing(true);
      try {
        const filters = await parseSearchQuery(transcript);
        onParsed?.(filters, transcript);
      } catch (err) {
        setError(err.message || "Couldn't parse query");
      } finally {
        setParsing(false);
      }
    };

    try {
      rec.start();
    } catch (err) {
      setError(err.message || "Could not start microphone");
    }
  };

  const label = listening
    ? "Stop listening"
    : parsing
    ? "Understanding…"
    : "Voice search";

  return (
    <div className="voice-search-wrap">
      <button
        type="button"
        className={`voice-btn ${listening ? "voice-btn-listening" : ""} ${
          parsing ? "voice-btn-parsing" : ""
        }`}
        onClick={handleClick}
        disabled={parsing}
        aria-label={label}
        title={label}
      >
        {listening ? "■" : parsing ? "…" : "🎤"}
      </button>
      {error && <span className="voice-error">{error}</span>}
    </div>
  );
}
