#!/usr/bin/env python3
"""Synthesises the small sounds that go with the motion (ours, CC0): a paper flip and three soft foundation chimes.
    python3 tools/make_sounds.py        -> sounds/flip.wav, sounds/found_1.wav .. found_3.wav
Then run  python3 tools/make_sound_manifest.py  so the app lists them. Needs numpy.
The place and draw sounds stay Kenney's (see sounds/SoundCredits.txt)."""
import os, struct, wave
import numpy as np

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
SR = 44100
rng = np.random.default_rng(7)

def write(name, y, peak=0.5):
    y = np.asarray(y, dtype=np.float64)
    y = y / (np.max(np.abs(y)) or 1) * peak
    # a short fade at both ends so nothing clicks
    n = len(y); f = min(220, n // 8)
    y[:f] *= np.linspace(0, 1, f); y[-f:] *= np.linspace(1, 0, f)
    with wave.open(os.path.join(ROOT, "sounds", name), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes(struct.pack("<%dh" % n, *np.clip(y * 32767, -32768, 32767).astype(np.int16)))
    print(name, f"{n / SR * 1000:.0f} ms")

def env(n, attack, decay, curve=4.0):
    t = np.arange(n) / SR
    a = np.clip(t / attack, 0, 1)
    d = np.exp(-curve * np.clip((t - attack), 0, None) / decay)
    return a * d

def bandpass(x, lo, hi):
    X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
    X[(f < lo) | (f > hi)] = 0
    X *= np.exp(-((f - (lo + hi) / 2) / ((hi - lo) / 1.2)) ** 2)      # soft bell in the band
    return np.fft.irfft(X, len(x))

def flip():
    """A card turning over: a breath of paper, a little body underneath, 110 ms."""
    n = int(SR * 0.11)
    air = bandpass(rng.standard_normal(n), 1800, 7000) * env(n, 0.008, 0.045, 3.5)
    body = bandpass(rng.standard_normal(n), 250, 900) * env(n, 0.004, 0.03, 4) * 0.5
    t = np.arange(n) / SR
    thump = np.sin(2 * np.pi * 150 * t) * np.exp(-t * 60) * 0.35
    return air + body + thump

def chime(freq):
    """A soft bell for a card reaching its foundation: a few inharmonic partials, 650 ms, mostly fundamental."""
    n = int(SR * 0.65); t = np.arange(n) / SR
    parts = [(1.0, 1.0, 0.55), (2.76, 0.28, 0.22), (5.4, 0.08, 0.1), (0.5, 0.12, 0.4)]   # ratio, level, decay seconds
    y = np.zeros(n)
    for ratio, lvl, dec in parts:
        y += lvl * np.sin(2 * np.pi * freq * ratio * t + rng.uniform(0, 1)) * np.exp(-t / dec)
    strike = bandpass(rng.standard_normal(n), 2000, 6000) * env(n, 0.001, 0.012, 5) * 0.12
    return y * env(n, 0.003, 0.5, 1.0) + strike

if __name__ == "__main__":
    write("flip.wav", flip(), 0.42)
    for i, f in enumerate([880.0, 987.77, 1174.66], 1):       # A5, B5, D6: pleasant in any order
        write(f"found_{i}.wav", chime(f), 0.38)
