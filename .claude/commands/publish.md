---
description: Review the changes, run the tests, then publish with tools/publish.sh
argument-hint: [commit message]
---
1. Run `git status --short` and `git diff --stat`, and summarize the changes in three lines.
2. Run the full tests: `node --test tests/*.test.mjs` and `sh tests/run-e2e.sh`. Stop if anything fails.
3. Ask me to confirm. Do not continue without a clear yes.
4. Run `./tools/publish.sh "$ARGUMENTS"`. If I gave no message, write a short one.
5. Run `git log --oneline -3`. Tell me the site is https://jenningsjason76.github.io/kittycat-solitaire/ and takes about a minute to update, and remind me to reload it on the phone.
