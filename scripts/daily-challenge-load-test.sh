#!/usr/bin/env bash
set -euo pipefail

# Daily Challenge load test (50 users) without triggering /auth/login rate-limit:
# - Warm up tokens slowly (sequential, with backoff on 429)
# - Use cached tokens for start/submit calls (no burst logins during the window)
#
# Requirements: bash, curl, python3
#
# Usage example:
#   API_BASE="https://api.radar-mr.com/api/v1" \
#   PASSWORD="medn1234" \
#   EMAILS_FILE="./emails.txt" \
#   ./scripts/daily-challenge-load-test.sh warmup
#
#   ./scripts/daily-challenge-load-test.sh run
#   ./scripts/daily-challenge-load-test.sh grace

API_BASE="${API_BASE:-https://api.radar-mr.com/api/v1}"
PASSWORD="${PASSWORD:-}"
EMAILS_FILE="${EMAILS_FILE:-}"
TOKENS_FILE="${TOKENS_FILE:-/tmp/daily_challenge_tokens.jsonl}"

WARMUP_SLEEP_S="${WARMUP_SLEEP_S:-2}"
WARMUP_MAX_RETRIES="${WARMUP_MAX_RETRIES:-8}"

REQUEST_MAX_RETRIES="${REQUEST_MAX_RETRIES:-5}"
REQUEST_BACKOFF_BASE_S="${REQUEST_BACKOFF_BASE_S:-1}"

SUBMIT_BODY_JSON="${SUBMIT_BODY_JSON:-{\"score\":5,\"correct\":5,\"total\":5,\"timeTakenS\":10}}"

usage() {
  echo "Usage:"
  echo "  PASSWORD=... EMAILS_FILE=... $0 warmup"
  echo "  PASSWORD=... EMAILS_FILE=... $0 run"
  echo "  PASSWORD=... EMAILS_FILE=... $0 grace"
  echo
  echo "Env:"
  echo "  API_BASE (default: $API_BASE)"
  echo "  PASSWORD (required)"
  echo "  EMAILS_FILE (required)"
  echo "  TOKENS_FILE (default: $TOKENS_FILE)"
  echo "  WARMUP_SLEEP_S (default: $WARMUP_SLEEP_S)"
  echo "  SUBMIT_BODY_JSON (default: $SUBMIT_BODY_JSON)"
}

need_env() {
  if [[ -z "${PASSWORD}" || -z "${EMAILS_FILE}" ]]; then
    echo "ERROR: PASSWORD and EMAILS_FILE are required."
    usage
    exit 2
  fi
  if [[ ! -f "${EMAILS_FILE}" ]]; then
    echo "ERROR: EMAILS_FILE not found: ${EMAILS_FILE}"
    exit 2
  fi
}

login_one() {
  local email="$1"
  local tmp
  tmp="$(mktemp)"
  local code
  code="$(curl -sS --max-time 15 -o "$tmp" -w "%{http_code}" \
    -X POST "${API_BASE}/auth/login" \
    -H "Content-Type: application/json" \
    -d "{\"email\":\"${email}\",\"password\":\"${PASSWORD}\"}" || true)"

  if [[ "$code" == "200" ]]; then
    # Sometimes upstream/proxy returns 200 with an empty/non-JSON body (transient).
    # Treat that as retryable instead of crashing the whole run.
    if ! python3 -c 'import json,sys; s=sys.stdin.read().strip(); j=json.loads(s); print(j.get("access",""))' <"$tmp" >"$tmp.access" 2>/dev/null; then
      rm -f "$tmp" "$tmp.access"
      echo "__PARSE__"
      return 0
    fi
    local access
    access="$(cat "$tmp.access" | tr -d '\n')"
    rm -f "$tmp" "$tmp.access"
    if [[ -z "$access" ]]; then
      echo "__PARSE__"
      return 0
    fi
    python3 -c 'import json,sys; print(json.dumps({"email": sys.argv[1], "access": sys.argv[2]}))' "$email" "$access"
    return 0
  fi

  if [[ "$code" == "429" ]]; then
    rm -f "$tmp"
    echo "__RATE_LIMIT__"
    return 0
  fi

  rm -f "$tmp"
  echo "__HTTP_${code}__"
  return 0
}

warmup_tokens() {
  need_env
  : > "${TOKENS_FILE}"

  local ok=0
  local fail=0
  local rate=0

  while IFS= read -r email; do
    [[ -z "$email" ]] && continue
    local attempt=0
    local backoff="${WARMUP_SLEEP_S}"

    while true; do
      attempt=$((attempt+1))
      local out
      out="$(login_one "$email" || true)"
      if [[ "$out" == "__RATE_LIMIT__" ]]; then
        rate=$((rate+1))
        sleep "$backoff"
        backoff=$((backoff*2))
        if [[ "$attempt" -ge "$WARMUP_MAX_RETRIES" ]]; then
          echo "WARN: warmup failed (rate-limit) for $email after $attempt retries" >&2
          fail=$((fail+1))
          break
        fi
        continue
      fi

      if [[ "$out" == "__PARSE__" ]]; then
        sleep "$backoff"
        backoff=$((backoff*2))
        if [[ "$attempt" -ge "$WARMUP_MAX_RETRIES" ]]; then
          echo "WARN: warmup failed (non-JSON/empty response) for $email after $attempt retries" >&2
          fail=$((fail+1))
          break
        fi
        continue
      fi

      if [[ "$out" == __HTTP_*__ ]]; then
        echo "WARN: warmup failed for $email ($out)" >&2
        fail=$((fail+1))
        break
      fi

      echo "$out" >> "${TOKENS_FILE}"
      ok=$((ok+1))
      sleep "${WARMUP_SLEEP_S}"
      break
    done
  done < "${EMAILS_FILE}"

  echo "Warmup done: ok=$ok fail=$fail rate_limit_hits=$rate"
  echo "Tokens saved to: ${TOKENS_FILE}"
}

token_for_email() {
  local email="$1"
  python3 - "$email" "$TOKENS_FILE" <<'PY'
import json,sys
email=sys.argv[1]
path=sys.argv[2]
with open(path,"r",encoding="utf-8") as f:
  for line in f:
    line=line.strip()
    if not line: continue
    j=json.loads(line)
    if j.get("email")==email:
      print(j.get("access",""))
      raise SystemExit(0)
print("")
PY
}

req_json() {
  # $1 method $2 url $3 token $4 body(optional)
  local method="$1" url="$2" token="$3" body="${4:-}"
  local i=0
  local tmp
  tmp="$(mktemp)"
  while true; do
    i=$((i+1))
    local code
    if [[ -n "$body" ]]; then
      code="$(curl -sS --max-time 15 -o "$tmp" -w "%{http_code}" \
        -X "$method" "$url" \
        -H "Authorization: Bearer ${token}" \
        -H "Content-Type: application/json" \
        -d "$body" || true)"
    else
      code="$(curl -sS --max-time 15 -o "$tmp" -w "%{http_code}" \
        -X "$method" "$url" \
        -H "Authorization: Bearer ${token}" || true)"
    fi

    if [[ "$code" == "200" || "$code" == "201" ]]; then
      cat "$tmp"
      rm -f "$tmp"
      return 0
    fi

    if [[ "$code" == "429" && "$i" -lt "$REQUEST_MAX_RETRIES" ]]; then
      sleep $((REQUEST_BACKOFF_BASE_S * i))
      continue
    fi

    echo "{\"http\":${code},\"body\":$(python3 -c 'import json,sys; print(json.dumps(sys.stdin.read()))' <"$tmp")}" >&2
    rm -f "$tmp"
    return 1
  done
}

run_phase() {
  need_env
  if [[ ! -f "${TOKENS_FILE}" ]]; then
    echo "ERROR: TOKENS_FILE not found: ${TOKENS_FILE}. Run warmup first."
    exit 2
  fi

  local ok=0
  local fail=0
  while IFS= read -r email; do
    [[ -z "$email" ]] && continue
    local token
    token="$(token_for_email "$email")"
    if [[ -z "$token" ]]; then
      echo "WARN: no token for $email (did warmup fail?)" >&2
      fail=$((fail+1))
      continue
    fi

    req_json POST "${API_BASE}/daily-challenge/start" "$token" '{}' >/dev/null || true
    if req_json POST "${API_BASE}/daily-challenge/submit" "$token" "${SUBMIT_BODY_JSON}" >/dev/null; then
      ok=$((ok+1))
    else
      fail=$((fail+1))
    fi
    sleep 0.05
  done < "${EMAILS_FILE}"

  echo "Run done: ok=$ok fail=$fail"
}

grace_test() {
  need_env
  if [[ ! -f "${TOKENS_FILE}" ]]; then
    echo "ERROR: TOKENS_FILE not found: ${TOKENS_FILE}. Run warmup first."
    exit 2
  fi

  # Use last 5 emails as grace candidates.
  local emails
  emails="$(tail -n 5 "${EMAILS_FILE}")"

  local windowEnd=""
  while IFS= read -r email; do
    [[ -z "$email" ]] && continue
    local token
    token="$(token_for_email "$email")"
    [[ -z "$token" ]] && continue

    local startResp
    startResp="$(req_json POST "${API_BASE}/daily-challenge/start" "$token" '{}')"
    if [[ -z "$windowEnd" ]]; then
      windowEnd="$(python3 -c 'import json,sys; print(json.loads(sys.stdin.read()).get("windowEndUtc",""))' <<<"$startResp")"
    fi
  done <<<"$emails"

  if [[ -z "$windowEnd" ]]; then
    echo "ERROR: couldn't determine windowEndUtc (is the challenge open?)" >&2
    exit 1
  fi

  local sleepS
  sleepS="$(python3 - "$windowEnd" <<'PY'
import sys
from datetime import datetime,timezone,timedelta
end=datetime.fromisoformat(sys.argv[1].replace("Z","+00:00"))
now=datetime.now(timezone.utc)
target=end+timedelta(seconds=5)
sec=max(0,int((target-now).total_seconds()))
print(sec)
PY
)"
  echo "Waiting for windowEnd+5s (sleep ${sleepS}s)..."
  sleep "$sleepS"

  local ok=0
  local fail=0
  while IFS= read -r email; do
    [[ -z "$email" ]] && continue
    local token
    token="$(token_for_email "$email")"
    [[ -z "$token" ]] && continue
    if req_json POST "${API_BASE}/daily-challenge/submit" "$token" "${SUBMIT_BODY_JSON}" >/dev/null; then
      ok=$((ok+1))
    else
      fail=$((fail+1))
    fi
  done <<<"$emails"

  echo "Grace test done (submit at end+5s): ok=$ok fail=$fail"
}

cmd="${1:-}"
case "$cmd" in
  warmup) warmup_tokens ;;
  run) run_phase ;;
  grace) grace_test ;;
  *)
    usage
    exit 2
    ;;
esac

