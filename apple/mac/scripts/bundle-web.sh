#!/bin/sh
# Builds the one-file game (every script, card, sound inline) and puts it where the Mac app loads it.
set -e
cd "$(dirname "$0")/../../.."
python3 tools/build_single.py
mkdir -p apple/mac/KittyCat/Web
cp dist/KittyCat-Solitaire.html apple/mac/KittyCat/Web/index.html
echo "apple/mac/KittyCat/Web/index.html ready"
