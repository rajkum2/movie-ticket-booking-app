import { useEffect, useState } from "react";
import { getFeatureFlags, setFeatureFlag } from "../../api";

// Admin panel for the global capability toggles. Flipping a flag here changes
// behaviour for every user immediately — turn it off and the chat reverts to
// the baseline, which is how you compare a capability on vs off.
export default function CapabilitiesTab() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [busyKey, setBusyKey] = useState(null);

  const load = () => {
    setLoading(true);
    setError(null);
    getFeatureFlags()
      .then(setFlags)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  };

  useEffect(load, []);

  const toggle = async (flag) => {
    setBusyKey(flag.key);
    setError(null);
    // Optimistic flip.
    const next = !flag.enabled;
    setFlags((prev) =>
      prev.map((f) => (f.key === flag.key ? { ...f, enabled: next } : f))
    );
    try {
      await setFeatureFlag(flag.key, next);
    } catch (e) {
      setError(e.message);
      setFlags((prev) =>
        prev.map((f) => (f.key === flag.key ? { ...f, enabled: !next } : f))
      );
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div>
      <div className="admin-head">
        <h2>Capabilities</h2>
        <button className="link-btn" onClick={load}>
          Refresh
        </button>
      </div>
      <p className="chat-lede" style={{ marginTop: 0 }}>
        Global on/off switches for experimental chat capabilities. Changes apply
        to every user immediately.
      </p>

      {loading && <p className="status">Loading…</p>}
      {error && <p className="status error">⚠️ {error}</p>}

      {!loading && !error && flags.length === 0 && (
        <p className="status">No capabilities defined yet.</p>
      )}

      {!loading && !error && (
        <div className="capability-list">
          {flags.map((flag) => (
            <div key={flag.key} className="capability-row card">
              <div className="capability-info">
                <div className="capability-title">
                  <strong>{flag.label || flag.key}</strong>
                  <span
                    className={`capability-state ${
                      flag.enabled ? "on" : "off"
                    }`}
                  >
                    {flag.enabled ? "On" : "Off"}
                  </span>
                </div>
                {flag.description && (
                  <p className="capability-desc">{flag.description}</p>
                )}
              </div>
              <label className="switch" title={flag.enabled ? "Disable" : "Enable"}>
                <input
                  type="checkbox"
                  checked={flag.enabled}
                  onChange={() => toggle(flag)}
                  disabled={busyKey === flag.key}
                />
                <span className="switch-track" />
              </label>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
