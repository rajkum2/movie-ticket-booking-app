#!/usr/bin/env python3
"""Dataset-level evaluation of the AI Summariser — the form you'd use as a gate.

Same checks as summariser_eval.py, but run over EVERY movie and rolled up into
one aggregate scorecard. Optionally pushes per-case scores to Langfuse.

Run:
    cd BN
    export DEEPSEEK_API_KEY=sk-...
    python3 evals/summariser_dataset_eval.py                 # local only
    python3 evals/summariser_dataset_eval.py --langfuse      # also send to Langfuse
"""
import argparse
import base64
import json
import os
import sys
import urllib.request

BASE = os.environ.get("CINEBOOK_API", "https://movie-ticket-booking-app-production-109b.up.railway.app")
EMAIL = os.environ.get("CINEBOOK_EMAIL", "admin@cinebook.com")
PASSWORD = os.environ.get("CINEBOOK_PASSWORD", "admin123")
DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY")
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"

# Langfuse (read from the same env the backend uses)
LF_PUBLIC = os.environ.get("LANGFUSE_PUBLIC_KEY")
LF_SECRET = os.environ.get("LANGFUSE_SECRET_KEY")
LF_HOST = os.environ.get("LANGFUSE_HOST") or os.environ.get("LANGFUSE_BASE_URL") or "https://cloud.langfuse.com"

WORD_MIN, WORD_MAX = 150, 260
PASS = 0.7

COVERAGE = ('You grade a film summary for COVERAGE (premise, themes, tone, performances/direction, '
            'critical reception). Rate 0..1. Return JSON {"score": <0..1>, "reason": ".."}')
FAITHFUL = ('You grade a film summary for FAITHFULNESS using your knowledge of TITLE. Rate 0..1 whether '
            'claims are accurate and nothing is invented. Return JSON {"score": <0..1>, "reason": ".."}')
SPOILER = ('You grade a film summary for being SPOILER-FREE (no third-act/ending reveals). Rate 0..1. '
           'Return JSON {"score": <0..1>, "reason": ".."}')


def _open(url, data=None, headers=None, method="GET"):
    req = urllib.request.Request(url, data=data, headers=headers or {}, method=method)
    return urllib.request.urlopen(req, timeout=90)


def login():
    r = _open(f"{BASE}/auth/login", json.dumps({"email": EMAIL, "password": PASSWORD}).encode(),
              {"Content-Type": "application/json"}, "POST")
    return json.loads(r.read())["token"]


def summarise(movie_id, token):
    """Returns (summary_text, trace_id). trace_id is '' when replayed from cache."""
    r = _open(f"{BASE}/movies/{movie_id}/summarise", b"{}",
              {"Content-Type": "application/json", "Authorization": f"Bearer {token}"}, "POST")
    return r.read().decode(), r.headers.get("X-Trace-Id", "")


def judge(rubric, payload):
    body = {"model": "deepseek-chat", "temperature": 0, "response_format": {"type": "json_object"},
            "messages": [{"role": "system", "content": rubric}, {"role": "user", "content": payload}]}
    r = _open(DEEPSEEK_URL, json.dumps(body).encode(),
              {"Content-Type": "application/json", "Authorization": f"Bearer {DEEPSEEK_KEY}"}, "POST")
    return json.loads(json.loads(r.read())["choices"][0]["message"]["content"])


def lf_score(trace_id, name, value, comment=""):
    """Attach a numeric score to a Langfuse trace via the public REST API."""
    auth = base64.b64encode(f"{LF_PUBLIC}:{LF_SECRET}".encode()).decode()
    body = {"traceId": trace_id, "name": name, "value": float(value),
            "dataType": "NUMERIC", "comment": comment[:480]}
    try:
        _open(f"{LF_HOST}/api/public/scores", json.dumps(body).encode(),
              {"Content-Type": "application/json", "Authorization": f"Basic {auth}"}, "POST")
        return True
    except Exception as exc:  # noqa: BLE001
        print(f"      (langfuse score failed: {exc})")
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--langfuse", action="store_true", help="push scores to Langfuse")
    args = ap.parse_args()
    if not DEEPSEEK_KEY:
        sys.exit("Set DEEPSEEK_API_KEY.")
    use_lf = args.langfuse and LF_PUBLIC and LF_SECRET
    if args.langfuse and not use_lf:
        print("(--langfuse given but LANGFUSE_PUBLIC_KEY/SECRET_KEY not set — skipping push)\n")

    token = login()
    movies = json.loads(_open(f"{BASE}/movies").read())
    print(f"Evaluating {len(movies)} movies"
          + (f"  ·  pushing scores to Langfuse ({LF_HOST})" if use_lf else "  ·  local only") + "\n")
    print(f"  {'id':<3} {'title':<22} {'len':>4} {'cov':>4} {'fai':>4} {'spo':>4}  result  trace")
    print("  " + "-" * 64)

    rows, pushed = [], 0
    for m in movies:
        summary, trace_id = summarise(m["id"], token)
        wc = len(summary.split())
        wc_ok = WORD_MIN <= wc <= WORD_MAX
        cov = float(judge(COVERAGE, f"SUMMARY:\n{summary}").get("score", 0))
        fai = float(judge(FAITHFUL, f"TITLE: {m['title']}\nSUMMARY:\n{summary}").get("score", 0))
        spo = float(judge(SPOILER, f"SUMMARY:\n{summary}").get("score", 0))
        ok = wc_ok and min(cov, fai, spo) >= PASS
        rows.append({"cov": cov, "fai": fai, "spo": spo, "len_ok": wc_ok, "pass": ok})

        if use_lf and trace_id:
            for name, val in [("coverage", cov), ("faithfulness", fai), ("spoiler_free", spo),
                              ("length_ok", 1.0 if wc_ok else 0.0)]:
                pushed += lf_score(trace_id, name, val)

        print(f"  {m['id']:<3} {m['title'][:22]:<22} {wc:>4} {cov:>4.2f} {fai:>4.2f} {spo:>4.2f}"
              f"  {'PASS ' if ok else 'FAIL '}  {trace_id[:12] or '(cached)'}")

    n = len(rows)
    avg = lambda k: sum(r[k] for r in rows) / n
    passed = sum(r["pass"] for r in rows)
    print("\n  ── AGGREGATE SCORECARD ──")
    print(f"  movies evaluated:     {n}")
    print(f"  avg coverage:         {avg('cov'):.2f}")
    print(f"  avg faithfulness:     {avg('fai'):.2f}")
    print(f"  avg spoiler-free:     {avg('spo'):.2f}")
    print(f"  length within band:   {sum(r['len_ok'] for r in rows)}/{n}")
    print(f"  OVERALL PASS:         {passed}/{n} ({passed/n:.0%})")
    if use_lf:
        print(f"  scores pushed to Langfuse: {pushed}")


if __name__ == "__main__":
    main()
