---
description: Run the rules tests, then the browser tests (all, or the names you give)
argument-hint: [browser test names, for example: cat motion]
---
Run `node --test tests/*.test.mjs`. Then run `sh tests/run-e2e.sh $ARGUMENTS`.
Report each test as PASS or FAIL in one short list. For a failure, show only the first error and your best guess at the cause. Do not fix anything until I say so.
