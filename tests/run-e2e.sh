#!/bin/sh
# Runs the browser tests against a local server. Usage:
#   sh tests/run-e2e.sh            (all of them, about 3 minutes)
#   sh tests/run-e2e.sh cat motion (only e2e_cat.py and e2e_motion.py)
# First time only:  python3 -m venv .venv && . .venv/bin/activate && pip install -r requirements-dev.txt && playwright install chromium
cd "$(dirname "$0")/.."
python3 -m http.server 8765 --bind 127.0.0.1 >/dev/null 2>&1 &
SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT
sleep 1
ALL="feedback_settings_stats notes cat deadend drag drag_only grace motion victory moves update audio"
LIST="${*:-$ALL}"
fail=0
for name in $LIST; do
  out=$(python3 "tests/e2e_${name}.py" 2>&1)
  if echo "$out" | grep -q "^errors: \[\]"; then echo "PASS  e2e_${name}"; else echo "FAIL  e2e_${name}"; echo "$out" | tail -8; fail=1; fi
done
exit $fail
