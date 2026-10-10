#!/bin/sh
# Publish a change to GitHub in one step:
#   1. run the rules tests (if Node.js is installed)
#   2. set a new offline-cache version (a timestamp) in sw.js, so phones fetch the new files
#   3. commit and push
# Usage:   ./tools/publish.sh "what you changed"
set -e
cd "$(dirname "$0")/.."
MSG="${1:-Update}"

git add -A
if git diff --cached --quiet; then
  echo "Nothing has changed, so there is nothing to publish."
  exit 0
fi

if command -v node >/dev/null 2>&1 && [ -f tests/engine.test.mjs ]; then
  node --test tests/*.test.mjs >/dev/null 2>&1 || { echo "The rules tests failed. Not publishing."; exit 1; }
  echo "Rules tests passed."
fi

# the version is a timestamp, so it always goes up (a phone only updates when sw.js changes)
V="v$(date +%Y%m%d%H%M%S)" perl -pi -e 's/(VERSION = .)[^\x27"]*/$1.$ENV{V}/e' sw.js
git add -A
git commit -m "$MSG"
git push -u origin HEAD
echo
echo "Pushed. The site updates in about a minute:"
echo "https://jenningsjason76.github.io/kittycat-solitaire/"
