from PIL import Image, ImageFilter
import numpy as np, os, sys, warnings
warnings.filterwarnings("ignore")
Image.MAX_IMAGE_PIXELS = None
im = Image.open(os.environ.get('SHEET', 'sheet.png'))
cols = [(96,1001),(1071,1977),(2042,2949)]
# recompute grid exactly
a = np.array(im)[:, :, 3] > 10
def runs(v):
    out=[]; s=None
    for i,x in enumerate(v):
        if x and s is None: s=i
        if not x and s is not None: out.append((s,i-1)); s=None
    if s is not None: out.append((s,len(v)-1))
    return out
cols = runs(a.any(axis=0)); rows = runs(a.any(axis=1))
W, H = 908, 1356
OUT = (480, 720)
suits = ['spades','hearts','diamonds','clubs']

def ink(rgb):   # not-white pixels
    return (765 - rgb.sum(axis=2)) > 120

def split_index(card):
    """find the rank and suit glyphs of the original top-left index"""
    rgb = np.array(card.convert('RGB')).astype(int)
    x0, x1, y0, y1 = 30, int(0.165*W), 40, int(0.265*H)
    m = ink(rgb[y0:y1, x0:x1])
    ys = np.where(m.any(axis=1))[0]; xs = np.where(m.any(axis=0))[0]
    top, bot, left, right = ys.min()+y0, ys.max()+y0, xs.min()+x0, xs.max()+x0
    prof = m.any(axis=1)
    # largest gap of empty rows between rank and suit
    gaps = []; start = None
    for i in range(ys.min(), ys.max()+1):
        if not prof[i] and start is None: start = i
        if prof[i] and start is not None: gaps.append((i-start, start, i)); start = None
    g = max(gaps)
    rank_rows = (ys.min()+y0, g[1]-1+y0); suit_rows = (g[2]+y0, ys.max()+y0)
    def bbox(r0, r1):
        sub = m[r0-y0:r1-y0+1]; xx = np.where(sub.any(axis=0))[0]
        return (xx.min()+x0, r0, xx.max()+x0+1, r1+1)
    return bbox(*rank_rows), bbox(*suit_rows), (left, top, right+1, bot+1)

BOLD_R = int(os.environ.get("BOLD_R", "11"))        # extra stroke, in pixels at the 908-wide working size
OUTDIR = os.environ.get("OUTDIR", "out")
ONLY = os.environ.get("ONLY")                         # e.g. "spades_10,hearts_13" for a quick look

def embolden(img, r):
    """Thickens dark or red strokes by about r pixels on every side, with softly rounded corners."""
    rgb = np.array(img.convert("RGB")).astype(float)
    ink = 255 - rgb.min(axis=2)
    top = ink.max()
    core = ink > 0.7 * top
    color = np.median(rgb[core], axis=0)
    alpha = Image.fromarray((ink / top * 255).clip(0, 255).astype("uint8"))
    alpha = alpha.filter(ImageFilter.MaxFilter(2 * r + 1)).filter(ImageFilter.GaussianBlur(max(1.0, r * 0.35)))
    a = np.array(alpha).astype(float) / 255
    a = np.clip((a - 0.5) * 3 + 0.5, 0, 1)[..., None]
    out = 255 * (1 - a) + color[None, None, :] * a
    out_img = Image.fromarray(out.astype("uint8")).convert("RGBA")
    m = (255 - out.min(axis=2)) > 40
    ys, xs = np.where(m)
    return out_img.crop((xs.min(), ys.min(), xs.max() + 1, ys.max() + 1))

def enlarge(card, report=False):
    rank_b, suit_b, all_b = split_index(card)
    pad = BOLD_R + 4
    rank = card.crop((rank_b[0] - pad, rank_b[1] - pad, rank_b[2] + pad, rank_b[3] + pad))
    rank = embolden(rank, BOLD_R) if BOLD_R > 0 else card.crop(rank_b)
    suit = card.crop(suit_b)
    th_rank = int(0.215*H); th_suit = int(0.112*H)
    maxw = int(0.150*W)                                  # keep clear of the first column of pips ('10' is the widest)
    wid = rank.width*th_rank/rank.height
    if wid > maxw: th_rank = int(th_rank*maxw/wid)
    rank = rank.resize((round(rank.width*th_rank/rank.height), th_rank), Image.LANCZOS)
    suit = suit.resize((round(suit.width*th_suit/suit.height), th_suit), Image.LANCZOS)
    gap = int(0.014*H)
    bw = max(rank.width, suit.width); bh = rank.height + gap + suit.height
    blk = Image.new('RGBA', (bw, bh), (255,255,255,255))
    blk.paste(rank, ((bw-rank.width)//2, 0)); blk.paste(suit, ((bw-suit.width)//2, rank.height+gap))
    # erase the old small indexes (top-left and bottom-right), then draw the large ones
    pad = 8
    l, t, r, b = all_b
    white = Image.new('RGBA', (r-l+2*pad, b-t+2*pad), (255,255,255,255))
    card.paste(white, (l-pad, t-pad))
    card.paste(white, (W-r-pad, H-b-pad))
    mx, my = int(0.030*W), int(0.024*H)
    card.paste(blk, (mx, my))
    card.paste(blk.rotate(180), (W-mx-bw, H-my-bh))
    if report: return rank_b, suit_b, (bw, bh)

def crop(ci, ri):
    x0, y0 = cols[ci][0], rows[ri][0]
    return im.crop((x0, y0, x0+W, y0+H)).convert('RGBA')

stats = []
for ri, suit in enumerate(suits):
    for ci in range(13):
        if ONLY and f'{suit}_{ci+1}' not in ONLY.split(','): continue
        c = crop(ci, ri)
        info = enlarge(c, report=(ci in (0, 9, 10)))
        if info: stats.append((suit, ci+1, info))
        out = c.resize(OUT, Image.LANCZOS)
        out.save(f'{OUTDIR}/png/card_{suit}_{ci+1}.png', optimize=True)
        out.save(f'{OUTDIR}/webp/card_{suit}_{ci+1}.webp', 'WEBP', quality=86, method=6)
for ci, name in ([] if ONLY else zip([4,5,6,7], ['blue','red','purple','yellow'])):
    out = crop(ci, 4).resize(OUT, Image.LANCZOS)
    out.save(f'{OUTDIR}/png/card_back_{name}.png', optimize=True)
    out.save(f'{OUTDIR}/webp/card_back_{name}.webp', 'WEBP', quality=86, method=6)
for s in stats[:6]: print(s)
tot_p = sum(os.path.getsize(f'{OUTDIR}/png/'+f) for f in os.listdir(f'{OUTDIR}/png'))
tot_w = sum(os.path.getsize(f'{OUTDIR}/webp/'+f) for f in os.listdir(f'{OUTDIR}/webp'))
print('files', len(os.listdir('/tmp/new_cards/png')), 'png MB', round(tot_p/1e6,2), 'webp MB', round(tot_w/1e6,2))
