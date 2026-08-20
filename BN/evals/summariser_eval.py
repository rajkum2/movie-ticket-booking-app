#!/usr/bin/env python3
"""A fully narrated evaluation of the AI Summariser (Layer 1).

It prints the INPUT and OUTPUT of every step so you can SEE how evaluation
works: get an output -> check it deterministically -> judge it with an LLM ->
score it -> then do the same to a deliberately BAD summary to watch the eval
catch the problems.

Run:
    cd BN
    export DEEPSEEK_API_KEY=sk-...
    python3 evals/summariser_eval.py            # evaluates movie id 1
    python3 evals/summariser_eval.py 2          # evaluates a different movie
"""
import json
import os
import sys
import urllib.request

BASE = os.environ.get("CINEBOOK_API", "https://movie-ticket-booking-app-production-109b.up.railway.app")
EMAIL = os.environ.get("CINEBOOK_EMAIL", "admin@cinebook.com")
PASSWORD = os.environ.get("CINEBOOK_PASSWORD", "admin123")
DEEPSEEK_KEY = os.environ.get("DEEPSEEK_API_KEY")
DEEPSEEK_URL = "https://api.deepseek.com/v1/chat/completions"

# Deterministic target: the prompt asks for ~180-220 words. We accept a band.
WORD_MIN, WORD_MAX = 150, 260


def hr(title):
    print("\n" + "=" * 70 + f"\n{title}\n" + "=" * 70)


def post(path, body, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = urllib.request.Request(f"{BASE}{path}", data=json.dumps(body).encode(), headers=headers, method="POST")
    return urllib.request.urlopen(req, timeout=90)


def get(path, token):
    req = urllib.request.Request(f"{BASE}{path}", headers={"Authorization": f"Bearer {token}"})
    return json.load(urllib.request.urlopen(req, timeout=30))


def judge(name, rubric, payload):
    """Run one LLM-as-judge check. Prints exactly what is sent and returned."""
    print(f"\n--- JUDGE: {name} ---")
    print("  JUDGE INPUT (rubric sent to the judge model):")
    for line in rubric.strip().split("\n"):
        print("    " + line)
    print("  JUDGE INPUT (the content being judged):")
    print("    " + payload.replace("\n", "\n    ")[:600] + (" ..." if len(payload) > 600 else ""))
    body = {
        "model": "deepseek-chat",
        "temperature": 0,
        "response_format": {"type": "json_object"},
        "messages": [{"role": "system", "content": rubric}, {"role": "user", "content": payload}],
    }
    req = urllib.request.Request(
        DEEPSEEK_URL, data=json.dumps(body).encode(),
        headers={"Content-Type": "application/json", "Authorization": f"Bearer {DEEPSEEK_KEY}"}, method="POST")
    content = json.load(urllib.request.urlopen(req, timeout=60))["choices"][0]["message"]["content"]
    result = json.loads(content)
    print("  JUDGE OUTPUT (raw JSON it returned):")
    print("    " + json.dumps(result, indent=2).replace("\n", "\n    "))
    return result


COVERAGE = (
    "You grade a film summary for COVERAGE. A good summary covers: premise, "
    "themes, tone, notable performances or direction, and critical reception. "
    "Rate 0..1 (1.0 = covers all). Return JSON "
    '{"score": <0..1>, "covered": [..], "missing": [..], "reason": ".."}'
)
FAITHFUL = (
    "You grade a film summary for FAITHFULNESS using your knowledge of the film "
    "named in TITLE. Rate 0..1 whether the factual claims are accurate and the "
    "summary does not invent plot, characters, or cast (1.0 = fully accurate). "
    'Return JSON {"score": <0..1>, "issues": [..], "reason": ".."}'
)
SPOILER = (
    "You grade a film summary for being SPOILER-FREE. Rate 0..1 whether it "
    "avoids revealing third-act twists or the ending (1.0 = no spoilers). "
    'Return JSON {"score": <0..1>, "spoilers": [..], "reason": ".."}'
)


def evaluate(title, summary, label):
    hr(f"EVALUATING: {label}  (movie: {title})")
    print("INPUT — the summary text being evaluated:\n")
    print("    " + summary.replace("\n", "\n    "))

    # ---- Deterministic check ----
    wc = len(summary.split())
    wc_pass = WORD_MIN <= wc <= WORD_MAX
    print("\n--- DETERMINISTIC CHECK: length ---")
    print(f"  word_count = {wc}   target {WORD_MIN}-{WORD_MAX}   -> {'PASS' if wc_pass else 'FAIL'}")

    # ---- LLM-as-judge checks ----
    cov = judge("coverage", COVERAGE, f"SUMMARY:\n{summary}")
    fai = judge("faithfulness", FAITHFUL, f"TITLE: {title}\nSUMMARY:\n{summary}")
    spo = judge("spoiler-free", SPOILER, f"SUMMARY:\n{summary}")

    # ---- Scorecard ----
    scores = {
        "length": "PASS" if wc_pass else "FAIL",
        "coverage": cov.get("score"),
        "faithfulness": fai.get("score"),
        "spoiler_free": spo.get("score"),
    }
    judged = [cov.get("score", 0), fai.get("score", 0), spo.get("score", 0)]
    overall = wc_pass and min(judged) >= 0.7
    print("\n--- SCORECARD ---")
    for k, v in scores.items():
        print(f"  {k:<14} {v}")
    print(f"  {'OVERALL':<14} {'PASS ✅' if overall else 'FAIL ❌'}")
    return overall


def main():
    if not DEEPSEEK_KEY:
        sys.exit("Set DEEPSEEK_API_KEY (the LLM judge needs it).")
    movie_id = int(sys.argv[1]) if len(sys.argv) > 1 else 1

    hr("STEP 1 — PRODUCE THE OUTPUT WE WILL EVALUATE")
    token = post("/auth/login", {"email": EMAIL, "password": PASSWORD}).read()
    token = json.loads(token)["token"]
    movie = get(f"/movies/{movie_id}", token)
    title = movie["title"]
    print(f"INPUT to the summariser: movie_id={movie_id}  title={title!r}")
    print("Calling POST /movies/%d/summarise ..." % movie_id)
    real_summary = post(f"/movies/{movie_id}/summarise", {}, token).read().decode("utf-8")

    # The GOOD case: the real model output
    evaluate(title, real_summary, "REAL summariser output (the GOOD case)")

    # The BAD case: a deliberately poor summary, judged the SAME way, so you can
    # watch the metrics drop and the reasons explain why.
    bad = (
        f"{title} is a movie. It is really good and everyone dies at the very "
        "end which is the big twist. You should watch it. The end."
    )
    evaluate(title, bad, "DELIBERATELY BAD summary (to show eval catching problems)")

    hr("WHAT YOU JUST SAW")
    print("  1. INPUT (a movie) -> OUTPUT (a summary) = the thing under test")
    print("  2. A DETERMINISTIC check (word count) — pure code, instant, objective")
    print("  3. THREE LLM-AS-JUDGE checks — each got a rubric + the summary, returned a score+reason")
    print("  4. A SCORECARD combining them into PASS/FAIL")
    print("  5. The SAME pipeline on a bad summary -> scores drop, reasons explain why")
    print("  => That contrast (good PASS vs bad FAIL) is proof the eval actually measures quality.")


if __name__ == "__main__":
    main()
