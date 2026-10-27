#!/usr/bin/env python3
"""Draws the three vector decks (Thorn & Star, Centre Ice, Reading Room) as SVG files.

    python3 tools/cards/make_svg_decks.py            -> cards/thorn/, cards/ice/, cards/room/
    DECKS=room python3 tools/cards/make_svg_decks.py  -> one deck only

Each deck is 52 faces (card_<suit>_<rank>.svg, the same names as the classic deck) plus
card_back_light.svg and card_back_dark.svg. Everything is drawn here, so the artwork is ours (CC0).
The corner numbers are glyph outlines taken from open fonts with fontTools (pip install fonttools),
so every device shows the same heavy numbers; see cards/CREDITS.txt for the font licences.
Card box: 250 x 350 units. Corner number cap height NUM (21.5% of the card), suit under it SUIT_H (11%).
"""
import math, os, sys
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "..")
W, H = 250, 350
NUM = 75          # cap height of the corner number (21.5% of the card, like the Classic deck)
SUIT_H = 38       # height of the small suit under it
FONTS = {
    "caladea": "/usr/share/fonts/truetype/crosextra/Caladea-Bold.ttf",
    "liberation": "/usr/share/fonts/truetype/liberation/LiberationSerif-Bold.ttf",
    "inter": "/usr/share/fonts/opentype/inter/Inter-ExtraBold.otf",
    "freeserif": "/usr/share/fonts/truetype/freefont/FreeSerifBold.ttf",
}

SUITS = {"spades": "s", "hearts": "h", "diamonds": "d", "clubs": "c"}
SUIT_PATH = {   # 100 x 110 box, drawn once per card as a symbol
    "s": "M50 4C50 4 10 44 10 64c0 15 15 25 30 20 5-2 8-5 10-10 2 5 5 8 10 10 15 5 30-5 30-20C90 44 50 4 50 4zM44 84c-2 10-6 15-12 21h36c-6-6-10-11-12-21z",
    "h": "M50 102C20 76 5 56 5 36 5 17 19 6 32 6c9 0 15 6 18 12 3-6 9-12 18-12 13 0 27 11 27 30 0 20-15 40-45 66z",
    "d": "M50 4Q76 40 92 54 76 68 50 104 24 68 8 54 24 40 50 4z",
    "c": "M50 6a20 20 0 1 1-.1 0zM28 42a20 20 0 1 1-.1 0zM72 42a20 20 0 1 1-.1 0zM44 70c0 14-4 24-12 35h36c-8-11-12-21-12-35z",
}
RED = {"h", "d"}
RANK_TEXT = {1: "A", 11: "J", 12: "Q", 13: "K"}
PIPS = {
    2: [(.5, 0), (.5, 1)], 3: [(.5, 0), (.5, .5), (.5, 1)], 4: [(0, 0), (1, 0), (0, 1), (1, 1)],
    5: [(0, 0), (1, 0), (.5, .5), (0, 1), (1, 1)], 6: [(0, 0), (1, 0), (0, .5), (1, .5), (0, 1), (1, 1)],
    7: [(0, 0), (1, 0), (.5, .25), (0, .5), (1, .5), (0, 1), (1, 1)],
    8: [(0, 0), (1, 0), (.5, .25), (0, .5), (1, .5), (.5, .75), (0, 1), (1, 1)],
    9: [(0, 0), (1, 0), (0, 1 / 3), (1, 1 / 3), (.5, .5), (0, 2 / 3), (1, 2 / 3), (0, 1), (1, 1)],
    10: [(0, 0), (1, 0), (.5, 1 / 6), (0, 1 / 3), (1, 1 / 3), (0, 2 / 3), (1, 2 / 3), (.5, 5 / 6), (0, 1), (1, 1)],
}

DECKS = {
    "thorn": dict(font="freeserif", bold=2.4, double=True, hairline=True,
                  paper="#f6efe3", ink="#2a2230", red="#b8324f", gold="#b9924a", frame="#c9a85f",
                  light=dict(field="#4a2b55", line="#d8b76a"), dark=dict(field="#2a1733", line="#e0c27a")),
    "ice": dict(font="inter", bold=0, double=False, hairline=False,
                paper="#fbfcfd", ink="#17233a", red="#c8302e", gold="#d9892a", frame="#c9d3da",
                light=dict(field="#f2f5f7", line="#17233a"), dark=dict(field="#1d2c47", line="#e6edf2")),
    "room": dict(font="liberation", bold=2.6, double=True, hairline=True,
                 paper="#f3ead6", ink="#241a14", red="#9c2a2a", gold="#a8843c", frame="#b89a5c",
                 light=dict(field="#5a2222", line="#d2b06a"), dark=dict(field="#1f3a2c", line="#d2b06a")),
}

# ---------- glyph outlines ----------
_fonts = {}
def font(name):
    if name not in _fonts: _fonts[name] = TTFont(FONTS[name])
    return _fonts[name]

def text_path(fname, text, cap):
    """Path data for `text` with its cap height scaled to `cap`, baseline at y=0, plus its width."""
    f = font(fname); gs = f.getGlyphSet(); cmap = f.getBestCmap(); upm = f["head"].unitsPerEm
    cap_units = getattr(f["OS/2"], "sCapHeight", 0) or int(upm * 0.7)
    s = cap / cap_units
    x, d = 0.0, ""
    for i, ch in enumerate(text):
        g = gs[cmap[ord(ch)]]
        if i: x -= upm * 0.05                           # "10": tuck the 0 under the 1 a little
        pen = SVGPathPen(gs); g.draw(TransformPen(pen, (s, 0, 0, -s, x * s, 0)))
        d += pen.getCommands(); x += g.width
    return d, x * s

# ---------- small drawings (local coordinates, origin at the centre) ----------
def fmt(v): return f"{v:.1f}".rstrip("0").rstrip(".")
def star(cx, cy, r, color):
    pts = []
    for i in range(10):
        a = -math.pi / 2 + i * math.pi / 5; rr = r * .42 if i % 2 else r
        pts.append(f"{fmt(cx + rr * math.cos(a))} {fmt(cy + rr * math.sin(a))}")
    return f'<path d="M{"L".join(pts)}Z" fill="{color}"/>'
def crown(c, w=1.0):
    return (f'<g transform="scale({w})"><path d="M-40 0V-32L-22-14 0-44 22-14 40-32V0Z" fill="{c}"/><circle cx="-40" cy="-34" r="4" fill="{c}"/>'
            f'<circle cx="0" cy="-47" r="4.5" fill="{c}"/><circle cx="40" cy="-34" r="4" fill="{c}"/><rect x="-40" y="2" width="80" height="7" rx="2" fill="{c}"/></g>')
def dagger(c, c2):
    return (f'<g><path d="M0-78 8-22 0 46-8-22Z" fill="{c2}"/><path d="M0-78 2-22 0 46-2-22Z" fill="{c}" opacity=".5"/>'
            f'<rect x="-24" y="-26" width="48" height="8" rx="3" fill="{c}"/><rect x="-5" y="-18" width="10" height="34" rx="2" fill="{c}"/><circle cx="0" cy="22" r="7" fill="{c}"/></g>')
def rose(c, c2):
    return (f'<g><circle r="30" fill="none" stroke="{c}" stroke-width="5"/><circle r="19" fill="none" stroke="{c}" stroke-width="4.5"/><circle r="8" fill="{c}"/>'
            f'<path d="M-6-30c-6-6-14-6-20 0 6 6 14 6 20 0zM6 30c6 6 14 6 20 0-6-6-14-6-20 0z" fill="{c2}"/>'
            f'<path d="M-34 10c-14 4-22 14-24 26 12-2 22-10 24-26zM34-10c14-4 22-14 24-26-12 2-22 10-24 26z" fill="{c2}"/></g>')
def sticks(c, c2):
    return (f'<g><g transform="rotate(-28)"><path d="M-5-74h10v100l24 14-3 10-31-18z" fill="{c}"/></g><g transform="rotate(28)"><path d="M-5-74h10v100l-24 14 3 10 31-18z" fill="{c2}"/></g>'
            f'<ellipse cx="0" cy="44" rx="20" ry="7" fill="{c}"/><rect x="-20" y="44" width="40" height="8" fill="{c}"/><ellipse cx="0" cy="52" rx="20" ry="7" fill="{c}"/></g>')
def cup(c, c2):
    return (f'<g><path d="M-30-56h60v28c0 20-13 36-30 38-17-2-30-18-30-38z" fill="{c}"/>'
            f'<path d="M-30-46c-16 0-22 12-16 24 4 8 12 10 18 8M30-46c16 0 22 12 16 24-4 8-12 10-18 8" fill="none" stroke="{c}" stroke-width="7" stroke-linecap="round"/>'
            f'<rect x="-6" y="10" width="12" height="22" fill="{c}"/><rect x="-26" y="30" width="52" height="10" rx="3" fill="{c}"/><rect x="-32" y="40" width="64" height="8" rx="2" fill="{c2}"/></g>')
def skate(c, c2):
    return (f'<g><path d="M-30-50h22l10 34h26c10 0 16 8 16 16v6h-74z" fill="{c}"/><rect x="-30" y="12" width="74" height="7" fill="{c2}"/>'
            f'<path d="M-34 24h80c0 6-5 10-10 10h-60c-5 0-10-4-10-10z" fill="{c2}"/><rect x="-14" y="22" width="6" height="12" fill="{c2}"/><rect x="22" y="22" width="6" height="12" fill="{c2}"/></g>')
def quill(c, c2):
    return (f'<g><path d="M-36 58C-14 2 14-40 44-72 30-30 8 14-22 60c-6 2-10 1-14-2z" fill="{c}"/><path d="M-30 54C-8 8 14-28 40-66" fill="none" stroke="{c2}" stroke-width="2"/>'
            f'<rect x="-46" y="46" width="30" height="14" rx="3" fill="{c2}"/><rect x="-40" y="40" width="18" height="8" rx="2" fill="{c2}"/></g>')
def laurel(c):
    g = ""
    for i in range(6):
        a = -150 + i * 22; aa = math.radians(a); x = 64 * math.cos(aa); y = 64 * math.sin(aa) + 30
        g += (f'<ellipse cx="{fmt(x)}" cy="{fmt(y)}" rx="9" ry="4" transform="rotate({a + 90} {fmt(x)} {fmt(y)})" fill="{c}"/>'
              f'<ellipse cx="{fmt(-x)}" cy="{fmt(y)}" rx="9" ry="4" transform="rotate({-a - 90} {fmt(-x)} {fmt(y)})" fill="{c}"/>')
    return f"<g>{g}</g>"
def books(c, c2):
    return (f'<g><rect x="-40" y="12" width="80" height="14" rx="2" fill="{c}"/><rect x="-34" y="-2" width="70" height="14" rx="2" fill="{c2}"/>'
            f'<rect x="-38" y="-16" width="74" height="14" rx="2" fill="{c}"/><rect x="-30" y="16" width="60" height="2" fill="{c2}" opacity=".6"/><rect x="-28" y="-12" width="54" height="2" fill="{c2}" opacity=".6"/></g>')
def cat(c, s=1.0):   # a cat asleep, curled, tail round the front
    return (f'<g transform="scale({s})"><ellipse cx="0" cy="14" rx="24" ry="19" fill="{c}"/><circle cx="12" cy="-12" r="13" fill="{c}"/>'
            f'<path d="M1-20l-2-15 9 9zM17-24l5-13 3 14z" fill="{c}"/><path d="M-22 24c-20 4-24-18-8-20" fill="none" stroke="{c}" stroke-width="6" stroke-linecap="round"/></g>')
def paw(c, s=1.0):
    return (f'<g transform="scale({s})"><ellipse cx="0" cy="8" rx="13" ry="10" fill="{c}"/><circle cx="-12" cy="-6" r="5" fill="{c}"/><circle cx="-4" cy="-12" r="5" fill="{c}"/>'
            f'<circle cx="5" cy="-12" r="5" fill="{c}"/><circle cx="13" cy="-6" r="5" fill="{c}"/></g>')
def puck(c):
    return f'<g><ellipse cx="0" cy="-5" rx="30" ry="11" fill="{c}"/><rect x="-30" y="-5" width="60" height="12" fill="{c}"/><ellipse cx="0" cy="7" rx="30" ry="11" fill="{c}"/></g>'

def emblem(deck, rank, color, gold):
    if deck == "thorn":
        if rank == 13: return f'<g>{crown(color, 1.05)}{star(0, -74, 10, gold)}<path d="M-54-10c-10-14-10-30 0-44M54-10c10-14 10-30 0-44" fill="none" stroke="{gold}" stroke-width="3"/></g>'
        if rank == 12: return f'<g transform="translate(0 8)">{rose(color, gold)}<g transform="translate(0 -48)">{crown(gold, .45)}</g></g>'
        return f'<g>{dagger(color, gold)}{star(-34, -50, 6, gold)}{star(34, 40, 6, gold)}</g>'
    if deck == "ice":
        if rank == 13: return f'<g transform="translate(0 6)">{sticks(color, gold)}<g transform="translate(0 -70)">{crown(color, .5)}</g></g>'
        if rank == 12: return f'<g transform="translate(0 6)">{cup(color, gold)}</g>'
        return f'<g transform="translate(0 4)">{skate(color, gold)}</g>'
    if rank == 13: return f'<g>{laurel(gold)}{crown(color, .95)}<rect x="-3" y="2" width="6" height="56" fill="{color}"/><circle cx="0" cy="62" r="7" fill="{gold}"/></g>'
    if rank == 12: return f'<g>{laurel(gold)}<g transform="translate(0 -40)">{crown(color, .55)}</g><g transform="translate(0 18)">{books(color, gold)}</g></g>'
    return f'<g>{laurel(gold)}<g transform="translate(4 0)">{quill(color, gold)}</g></g>'


# ---------- Reading Room court figures: faceless engraved busts, double-ended, cut on the diagonal ----------
# Local coordinates: origin at the base of the neck, y grows downward. Kings wear a crown and hold a sword, an axe,
# an orb or a sceptre (one per suit, as in the English pattern); queens a coronet and a flower; jacks a cap and a pike,
# a halberd, an arrow or a leaf. Engraving is suggested with hatch lines in the suit colour at low opacity.
def hatch_defs(ink, color, gold):
    return (f'<pattern id="hh" width="5" height="5" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 2.5h5" stroke="{color}" stroke-width="1" opacity=".5"/></pattern>'
            f'<pattern id="hg" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(55)"><path d="M0 2h4" stroke="{gold}" stroke-width="1.2" opacity=".75"/></pattern>'
            f'<pattern id="hd" width="3.4" height="3.4" patternUnits="userSpaceOnUse" patternTransform="rotate(-35)"><path d="M0 1.7h3.4" stroke="{ink}" stroke-width="1" opacity=".65"/></pattern>')

def bust(rank, suit, ink, color, gold, paper):
    o = [f'<g stroke="{ink}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">']
    # robe and shoulders, cut square well below the diagonal
    o.append(f'<path d="M-64 94C-62 40-44 12-18 2 -8 -2 8 -2 18 2 44 12 62 40 64 94Z" fill="{paper}"/>'
             f'<path d="M-64 94C-62 40-44 12-18 2 -8 -2 8 -2 18 2 44 12 62 40 64 94Z" fill="url(#hh)" stroke="none"/>')
    # fold lines
    o.append(f'<path d="M-30 20C-36 44-40 70-42 94M30 20C36 44 40 70 42 94M-10 14C-12 40-12 70-11 94M10 14C12 40 12 70 11 94" fill="none" stroke-width="1" opacity=".55"/>')
    # collar: ermine band for the king and queen, a plain band for the jack
    if rank == 11:
        o.append(f'<path d="M-24 4C-10 16 10 16 24 4 20 14 10 22 0 24-10 22-20 14-24 4Z" fill="{paper}"/>')
    else:
        o.append(f'<path d="M-30 4C-16 20 16 20 30 4L36 16C20 34-20 34-36 16Z" fill="url(#hg)" stroke-width="1.4"/>'
                 f'<path d="M-30 4C-16 20 16 20 30 4L36 16C20 34-20 34-36 16Z" fill="none"/>'
                 f'<g fill="{ink}" stroke="none"><circle cx="-18" cy="18" r="1.6"/><circle cx="0" cy="23" r="1.6"/><circle cx="18" cy="18" r="1.6"/></g>')
    # neck and head (no face: the shadow side is hatched)
    o.append(f'<path d="M-9 4C-9 -6 9 -6 9 4" fill="{paper}"/>')
    o.append(f'<ellipse cx="0" cy="-26" rx="17" ry="21" fill="{paper}"/><path d="M4-47C16-44 20-30 16-14 12-8 6-5 0-5 8-12 12-26 10-36 8-42 6-45 4-47Z" fill="url(#hd)" stroke="none"/>')
    if rank == 13:    # hair and beard
        o.append(f'<path d="M-17-30C-24-14-22 4-14 10-8 14 8 14 14 10 22 4 24-14 17-30 14-18 10-10 0-10-10-10-14-18-17-30Z" fill="url(#hd)"/>'
                 f'<path d="M-17-30C-22-42-14-52 0-52 14-52 22-42 17-30" fill="url(#hd)"/>')
        o.append(f'<g transform="translate(0 -50) scale(.5)">{crown(gold, 1)}</g><g transform="translate(0 -50) scale(.5)" fill="none" stroke="{ink}" stroke-width="2"><path d="M-40 0V-32L-22-14 0-44 22-14 40-32V0Z"/></g>')
    elif rank == 12:  # hair, veil, coronet
        o.append(f'<path d="M-17-34C-26-40-28-18-22 4L-30 20C-24 8-20-10-17-26M17-34C26-40 28-18 22 4L30 20C24 8 20-10 17-26" fill="url(#hd)"/>'
                 f'<path d="M-17-32C-18-46-8-54 0-54 8-54 18-46 17-32" fill="url(#hd)"/>')
        o.append(f'<g fill="{gold}"><path d="M-16-50L-12-62-6-52 0-66 6-52 12-62 16-50Z"/><rect x="-16" y="-50" width="32" height="4" rx="1"/></g>'
                 f'<path d="M-16-50L-12-62-6-52 0-66 6-52 12-62 16-50Z" fill="none" stroke-width="1.2"/>')
    else:             # jack: bobbed hair and a flat cap with a feather
        o.append(f'<path d="M-17-30C-20-10-18 0-12 4L-8 2C-14-6-14-20-12-32ZM17-30C20-10 18 0 12 4L8 2C14-6 14-20 12-32Z" fill="url(#hd)"/>')
        o.append(f'<path d="M-22-44C-22-52 22-52 22-44L24-40H-24Z" fill="{gold}"/><ellipse cx="0" cy="-46" rx="23" ry="6" fill="{gold}"/>'
                 f'<path d="M14-50C22-62 30-68 40-70 34-62 26-54 16-48" fill="{paper}" stroke-width="1.2"/>')
    # the held item (right side, over the shoulder); one per suit
    item = {("13", "h"): "sword", ("13", "s"): "sword", ("13", "d"): "axe", ("13", "c"): "orb",
            ("12", "h"): "rose", ("12", "s"): "sceptre", ("12", "d"): "tulip", ("12", "c"): "thistle",
            ("11", "s"): "pike", ("11", "d"): "halberd", ("11", "c"): "arrow", ("11", "h"): "leaf"}[(str(rank), suit)]
    g = f'<g transform="translate(-48 60) rotate(16)">'
    if item == "sword": g += f'<path d="M0 10V-96" stroke-width="3"/><path d="M-12-70H12" stroke-width="3"/><circle cx="0" cy="12" r="4" fill="{gold}"/><path d="M-3-96L0-108 3-96Z" fill="{ink}"/>'
    elif item == "axe": g += f'<path d="M0 10V-92" stroke-width="3"/><path d="M0-90C-22-90-28-74-24-60L0-62Z" fill="{color}" opacity=".85"/>'
    elif item == "orb": g = f'<g transform="translate(-42 36)"><circle r="12" fill="{gold}"/><path d="M-12 0H12M0-12V12" stroke-width="1.2"/><path d="M0-12V-22M-5-17H5" stroke-width="2"/>'
    elif item == "sceptre": g += f'<path d="M0 10V-80" stroke-width="3"/><circle cx="0" cy="-86" r="7" fill="{gold}"/><circle cx="0" cy="-86" r="7" fill="none"/>'
    elif item in ("rose", "tulip", "thistle"):
        g = f'<g transform="translate(-42 44) rotate(10)"><path d="M0 10C-2-20 2-40 0-70" stroke-width="2" fill="none"/><path d="M0-30C-14-34-18-44-14-50 -4-46 0-40 0-30ZM2-46C14-50 18-60 14-66 4-62 2-56 2-46Z" fill="url(#hg)"/>'
        if item == "rose": g += f'<circle cx="0" cy="-78" r="9" fill="{color}" opacity=".85"/><circle cx="0" cy="-78" r="4.5" fill="none" stroke="{paper}" stroke-width="1.2"/>'
        elif item == "tulip": g += f'<path d="M-8-70C-10-82-6-90 0-92 6-90 10-82 8-70 4-66-4-66-8-70Z" fill="{color}" opacity=".85"/>'
        else: g += f'<path d="M-7-72C-9-82-4-90 0-92 4-90 9-82 7-72Z" fill="{color}" opacity=".85"/><path d="M-9-72H9L0-62Z" fill="url(#hg)"/>'
    elif item == "pike": g += f'<path d="M0 10V-100" stroke-width="3"/><path d="M-5-100L0-118 5-100Z" fill="{ink}"/>'
    elif item == "halberd": g += f'<path d="M0 10V-100" stroke-width="3"/><path d="M0-98C-18-96-22-78-14-66L0-70ZM0-96L8-110 2-80Z" fill="{color}" opacity=".85"/>'
    elif item == "arrow": g += f'<path d="M0 10V-90" stroke-width="3"/><path d="M-6-90L0-104 6-90Z" fill="{ink}"/><path d="M0 4L-8 14M0 4L8 14M0-6L-8 4M0-6L8 4" stroke-width="2"/>'
    else: g += f'<path d="M0 10C-2-20 2-40 0-70" stroke-width="2"/><path d="M0-70C-16-60-20-40-12-28 0-34 4-52 0-70ZM0-70C16-60 20-40 12-28 0-34-4-52 0-70Z" fill="url(#hg)"/>'
    o.append(g + '</g></g>')
    return "".join(o)

def court_room(rank, suit, color, gold, ink, paper):
    """The double-ended court for Reading Room: the frame, two clipped busts, the diagonal."""
    x0, y0, x1, y1 = 58, 100, 192, 256
    up = f'<clipPath id="cu"><polygon points="{x0},{y0} {x1},{y0} {x0},{y1}"/></clipPath>'
    dn = f'<clipPath id="cd"><polygon points="{x1},{y1} {x1},{y0} {x0},{y1}"/></clipPath>'
    b = bust(rank, suit, ink, color, gold, paper)
    return (f'<defs>{up}{dn}{hatch_defs(ink, color, gold)}</defs>'
            f'<g clip-path="url(#cu)"><g transform="translate(98 174) scale(.95)">{b}</g></g>'
            f'<g clip-path="url(#cd)"><g transform="translate(152 182) rotate(180) scale(.95)">{b}</g></g>'
            f'<path d="M{x0} {y1}L{x1} {y0}" stroke="{gold}" stroke-width=".9" opacity=".7"/>'
            f'<rect x="{x0}" y="{y0}" width="{x1 - x0}" height="{y1 - y0}" rx="6" fill="none" stroke="{gold}" stroke-width="1.5"/>')

# ---------- a card face ----------
def pip_use(x, y, size, flip=False):
    t = f"translate({fmt(x)} {fmt(y)})" + (" rotate(180)" if flip else "") + f" translate({fmt(-size / 2)} {fmt(-size * .55)}) scale({fmt(size / 100)})"
    return f'<use href="#s" transform="{t}"/>'

def face(deck, P, rank, suit):
    color = P["red"] if suit in RED else P["ink"]
    gold = P["gold"]
    txt = RANK_TEXT.get(rank, str(rank))
    d, tw = text_path(P["font"], txt, NUM)
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">',
         f'<defs><path id="s" d="{SUIT_PATH[suit]}" fill="{color}"/>',
         f'<g id="r"><path d="{d}" fill="{color}"' + (f' stroke="{color}" stroke-width="{P["bold"]}" stroke-linejoin="round"' if P["bold"] else "") + "/></g></defs>"]
    o.append(f'<rect x="1" y="1" width="{W - 2}" height="{H - 2}" rx="16" fill="{P["paper"]}" stroke="{P["frame"]}" stroke-width="2"/>')
    if P["hairline"]: o.append(f'<rect x="10" y="10" width="{W - 20}" height="{H - 20}" rx="10" fill="none" stroke="{gold}" stroke-width="1" opacity=".55"/>')
    # corners: number at the top left with its suit beneath, and the same rotated for the bottom right
    nx = 16
    corner = f'<use href="#r" transform="translate({nx} {18 + NUM})"/>' + pip_use(nx + min(tw, 40) / 2 + (0 if tw < 40 else 2), 18 + NUM + 8 + SUIT_H * .55, SUIT_H)
    o.append(f"<g>{corner}</g><g transform=\"rotate(180 {W / 2} {H / 2})\">{corner}</g>")
    if rank == 1:
        o.append(f'<g transform="translate({W / 2} {H / 2})">')
        if deck == "thorn":
            for i in range(8):
                a = i * math.pi / 4; o.append(star(84 * math.cos(a), 84 * math.sin(a), 6, gold))
        elif deck == "ice":
            o.append(f'<circle r="86" fill="none" stroke="{P["red"]}" stroke-width="3"/><path d="M-86 0h18M68 0h18M0-86v18M0 68v18" stroke="{P["ink"]}" stroke-width="3"/>')
            if suit == "s": o.append(f'<g transform="translate(70 70)">{paw(gold, .55)}</g>')
        else:
            o.append(f'<circle r="88" fill="none" stroke="{gold}" stroke-width="1.5"/><circle r="82" fill="none" stroke="{gold}" stroke-width=".8"/>')
            if suit == "s": o.append(f'<g transform="translate(72 76)">{cat(gold, .32)}</g>')
        o.append(pip_use(0, 2, 112) + "</g>")
    elif rank > 10 and deck == "room":
        o.append(court_room(rank, suit, color, gold, P["ink"], P["paper"]))
    elif rank > 10:
        o.append(f'<rect x="58" y="100" width="134" height="156" rx="6" fill="none" stroke="{gold}" stroke-width="1.5"/>')
        e = emblem(deck, rank, color, gold)
        if P["double"]:
            o.append(f'<path d="M58 256L192 100" stroke="{gold}" stroke-width=".8" opacity=".6"/>'
                     f'<g transform="translate(92 142) scale(.64)">{e}</g><g transform="translate(158 214) rotate(180) scale(.64)">{e}</g>')
        else:
            o.append(f'<g transform="translate({W / 2} {H / 2}) scale(.78)">{e}</g>')
    else:
        top, bot = 120, 230          # the pips start below the corner number (which ends at y = 18 + NUM)
        size = 40 if rank >= 9 else 44 if rank >= 4 else 50
        for fx, fy in PIPS[rank]:
            o.append(pip_use(85 + fx * 80, top + fy * (bot - top), size, fy > .5))
    o.append("</svg>")
    return "".join(o)

# ---------- a card back ----------
def back(deck, P, mode):
    f, l = P[mode]["field"], P[mode]["line"]
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}">',
         f'<rect x="1" y="1" width="{W - 2}" height="{H - 2}" rx="16" fill="{P["paper"]}" stroke="{P["frame"]}" stroke-width="2"/><rect x="12" y="12" width="226" height="326" rx="9" fill="{f}"/>']
    if deck == "thorn":
        o.append(f'<rect x="22" y="22" width="206" height="306" rx="5" fill="none" stroke="{l}" stroke-width="1.6"/><rect x="30" y="30" width="190" height="290" rx="3" fill="none" stroke="{l}" stroke-width=".7"/>')
        vine = f'<path d="M30 30c30 6 50 26 56 56M30 30c6 30 26 50 56 56" fill="none" stroke="{l}" stroke-width="1.4"/><path d="M48 36l6 10-10 2zM36 48l10 6-2-10zM64 56l6 10-10 2z" fill="{l}"/>'
        o.append(vine + "".join(f'<g transform="rotate({a} 125 175)">{vine}</g>' for a in (90, 180, 270)))
        o.append(f'<g transform="translate(125 175)"><path d="M-10-70a70 70 0 1 0 60 108 56 56 0 1 1-60-108z" fill="{l}" opacity=".95"/>'
                 f'<g transform="translate(-36 -2)">{cat(f, .62)}</g>{star(-58, -90, 7, l)}{star(70, -96, 5, l)}{star(84, -40, 4, l)}{star(-80, 62, 5, l)}{star(60, 98, 6, l)}</g>')
    elif deck == "ice":
        o.append(f'<path d="M12 190L238 12v70L12 260z" fill="{P["red"]}" opacity=".92"/><path d="M12 12l226 178v70L12 82z" fill="{P["ink"]}" opacity=".92"/>'
                 f'<circle cx="125" cy="175" r="58" fill="{f}"/><circle cx="125" cy="175" r="58" fill="none" stroke="{l}" stroke-width="3"/><circle cx="125" cy="175" r="46" fill="none" stroke="{P["red"]}" stroke-width="2"/>'
                 f'<g transform="translate(125 175)">{puck(P["ink"])}<g transform="translate(0 -7)">{paw(f, .5)}</g></g>'
                 f'<rect x="22" y="22" width="206" height="306" rx="4" fill="none" stroke="{l}" stroke-width="1.2"/>')
    else:
        o.append(f'<rect x="20" y="20" width="210" height="310" rx="4" fill="none" stroke="{l}" stroke-width="1.5"/><rect x="26" y="26" width="198" height="298" rx="2" fill="none" stroke="{l}" stroke-width=".6"/>'
                 f'<defs><pattern id="lat" width="22" height="22" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 11h22M11 0v22" stroke="{l}" stroke-width=".5" opacity=".45"/></pattern></defs>'
                 f'<rect x="30" y="30" width="190" height="290" fill="url(#lat)"/>'
                 f'<g transform="translate(125 175)"><rect x="-70" y="-62" width="140" height="124" rx="10" fill="{f}" stroke="{l}" stroke-width="2"/><rect x="-64" y="-56" width="128" height="112" rx="6" fill="none" stroke="{l}" stroke-width=".7"/>'
                 f'<g transform="translate(0 22) scale(1.1)">{books(l, P["paper"])}</g><g transform="translate(-4 -14)">{cat(l, .62)}</g>'
                 f'<path d="M-40-40h80" stroke="{l}" stroke-width=".8"/><path d="M-26-34h52" stroke="{l}" stroke-width=".6"/></g>')
    o.append("</svg>")
    return "".join(o)

def main():
    want = [d for d in os.environ.get("DECKS", ",".join(DECKS)).split(",") if d]
    for deck in want:
        P = DECKS[deck]
        out = os.path.join(ROOT, "cards", deck); os.makedirs(out, exist_ok=True)
        n = 0
        for sname, s in SUITS.items():
            for rank in range(1, 14):
                open(os.path.join(out, f"card_{sname}_{rank}.svg"), "w").write(face(deck, P, rank, s)); n += 1
        for mode in ("light", "dark"):
            open(os.path.join(out, f"card_back_{mode}.svg"), "w").write(back(deck, P, mode)); n += 1
        size = sum(os.path.getsize(os.path.join(out, f)) for f in os.listdir(out))
        print(f"{deck}: {n} files, {size / 1024:.0f} KB")

if __name__ == "__main__":
    main()
