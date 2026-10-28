"""Square sample logos for the demo documents (512px, transparent)."""
import math
import sys
from PIL import Image, ImageDraw, ImageFont

OUT = sys.argv[1]
S = 512
SUP = "/System/Library/Fonts/Supplemental/"


def canvas():
    img = Image.new("RGBA", (S * 2, S * 2), (0, 0, 0, 0))
    return img, ImageDraw.Draw(img)


def save(img, name):
    img.resize((S, S), Image.LANCZOS).save(f"{OUT}/{name}.png")


def hexrgb(h):
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))


W = (255, 255, 255, 255)

# Halvard Capital: navy rounded square, white "H" with a rule under it.
img, d = canvas()
d.rounded_rectangle((40, 40, 2 * S - 40, 2 * S - 40), radius=180, fill=hexrgb("#13294B"))
font = ImageFont.truetype(SUP + "Georgia Bold.ttf", 560)
d.text((S, S - 40), "H", font=font, fill=W, anchor="mm")
d.rectangle((S - 200, S + 250, S + 200, S + 280), fill=W)
save(img, "halvard")

# Ledger & Lane: oxblood circle, white serif ampersand.
img, d = canvas()
d.ellipse((40, 40, 2 * S - 40, 2 * S - 40), fill=hexrgb("#6E1F2A"))
font = ImageFont.truetype(SUP + "Georgia Italic.ttf", 640)
d.text((S, S + 20), "&", font=font, fill=W, anchor="mm")
save(img, "ledger-lane")

# Mossbank Institute: forest rounded square, white leaf with a midrib.
img, d = canvas()
d.rounded_rectangle((40, 40, 2 * S - 40, 2 * S - 40), radius=180, fill=hexrgb("#1F4D3A"))
leaf = Image.new("RGBA", (2 * S, 2 * S), (0, 0, 0, 0))
ld = ImageDraw.Draw(leaf)
ld.ellipse((S - 170, S - 380, S + 170, S + 380), fill=W)
ld.line((S, S - 300, S, S + 430), fill=hexrgb("#1F4D3A") + (255,), width=34)
leaf = leaf.rotate(-35, resample=Image.BICUBIC, center=(S, S))
img.alpha_composite(leaf)
save(img, "mossbank")

# Arcwell: graphite square, white quarter arc and dot.
img, d = canvas()
d.rounded_rectangle((40, 40, 2 * S - 40, 2 * S - 40), radius=120, fill=hexrgb("#1F2328"))
d.arc((250, 250, 2 * S + 250 - 300, 2 * S + 250 - 300), start=180, end=270, fill=W, width=110)
d.ellipse((620, 620, 780, 780), fill=W)
save(img, "arcwell")

# Tidewater Clinic: teal circle, three white waves.
img, d = canvas()
d.ellipse((40, 40, 2 * S - 40, 2 * S - 40), fill=hexrgb("#0F4C5C"))
for row, y in enumerate((S - 190, S, S + 190)):
    pts = []
    for x in range(230, 2 * S - 230 + 1, 8):
        pts.append((x, y + 55 * math.sin((x - 230) / 105)))
    d.line(pts, fill=W, width=58, joint="curve")
save(img, "tidewater")

# Calloway & Reid Architects: rust rounded square, white round arch on two piers.
img, d = canvas()
d.rounded_rectangle((40, 40, 2 * S - 40, 2 * S - 40), radius=180, fill=hexrgb("#7C2D12"))
d.arc((S - 260, S - 300, S + 260, S + 220), start=180, end=360, fill=W, width=70)
d.rectangle((S - 260, S - 40, S - 190, S + 300), fill=W)
d.rectangle((S + 190, S - 40, S + 260, S + 300), fill=W)
d.rectangle((S - 330, S + 300, S + 330, S + 360), fill=W)
save(img, "calloway-reid")

# Northbeam: cobalt rounded square, white north-pointing triangle over a beam.
img, d = canvas()
d.rounded_rectangle((40, 40, 2 * S - 40, 2 * S - 40), radius=120, fill=hexrgb("#1E40AF"))
d.polygon([(S, S - 330), (S + 230, S + 130), (S - 230, S + 130)], fill=W)
d.rectangle((S - 300, S + 220, S + 300, S + 290), fill=W)
save(img, "northbeam")

# Kestrel: fuchsia circle, white swept wing made of two chevrons.
img, d = canvas()
d.ellipse((40, 40, 2 * S - 40, 2 * S - 40), fill=hexrgb("#86198F"))
d.polygon([(S - 330, S - 60), (S, S + 260), (S + 330, S - 60), (S + 330, S + 70), (S, S + 390), (S - 330, S + 70)], fill=W)
d.polygon([(S - 230, S - 330), (S, S - 100), (S + 230, S - 330), (S + 230, S - 210), (S, S + 20), (S - 230, S - 210)], fill=W)
save(img, "kestrel")
