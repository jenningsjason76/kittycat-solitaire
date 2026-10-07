#!/usr/bin/env python3
"""Writes sounds/manifest.json from the files in sounds/.
Name effects place_1.wav, place_2.wav ..., slide_1.wav ..., tick.wav, win.wav and music music_1.m4a ...
Run from the project folder:  python3 tools/make_sound_manifest.py
"""
import json, os, re
d = os.path.join(os.path.dirname(__file__), "..", "sounds")
files = sorted(os.listdir(d))
groups = {}
for g in ("place", "slide", "tick", "win"):
    groups[g] = [f for f in files if re.fullmatch(rf"{g}(_\d+)?\.(wav|mp3|m4a|caf)", f)]
music = [f for f in files if re.fullmatch(r"music_\d+\.(m4a|mp3)", f)]
manifest = {"effects": {k: v for k, v in groups.items() if v}, "music": music}
json.dump(manifest, open(os.path.join(d, "manifest.json"), "w"), indent=2)
print(json.dumps(manifest, indent=2))
