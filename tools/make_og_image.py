"""Render og-image.png (1200x630 social preview). Run from the repo root: python tools/make_og_image.py"""
from PIL import Image, ImageDraw, ImageFont

W, H = 1200, 630
BG, SURFACE, BORDER = (14, 15, 18), (23, 25, 30), (42, 46, 54)
TEXT, MUTED, ACCENT = (236, 238, 242), (154, 161, 173), (123, 136, 255)
FONT = 'C:/Windows/Fonts/segoeui.ttf'
BOLD = 'C:/Windows/Fonts/segoeuib.ttf'

img = Image.new('RGB', (W, H), BG)
d = ImageDraw.Draw(img)

# soft accent glow behind the mouse
glow = Image.new('RGB', (W, H), BG)
gd = ImageDraw.Draw(glow)
for r in range(260, 0, -4):
    t = r / 260
    c = tuple(int(BG[i] + (ACCENT[i] - BG[i]) * (1 - t) * 0.18) for i in range(3))
    gd.ellipse((930 - r, 315 - r, 930 + r, 315 + r), fill=c)
img.paste(glow, (0, 0))
d = ImageDraw.Draw(img)

# stylised mouse, top view
mx, my, mw, mh = 840, 110, 180, 410
d.rounded_rectangle((mx, my, mx + mw, my + mh), radius=90, fill=SURFACE, outline=BORDER, width=4)
d.line((mx + mw // 2, my + 4, mx + mw // 2, my + 170), fill=BORDER, width=4)
d.line((mx + 4, my + 170, mx + mw - 4, my + 170), fill=BORDER, width=4)
d.rounded_rectangle((mx + mw // 2 - 14, my + 40, mx + mw // 2 + 14, my + 110), radius=14, fill=ACCENT)
d.rounded_rectangle((mx + mw // 2 - 10, my + 126, mx + mw // 2 + 10, my + 152), radius=6, fill=BORDER)
for i, y in enumerate((my + 200, my + 262)):
    d.rounded_rectangle((mx - 12, y, mx + 8, y + 52), radius=8, fill=BORDER)
# RGB strip
for i in range(9):
    hue = [(255, 59, 48), (255, 149, 0), (255, 204, 0), (52, 199, 89), (0, 199, 190), (88, 86, 214), (175, 82, 222), (255, 45, 85), (255, 59, 48)][i]
    d.rounded_rectangle((mx + 30 + i * 14, my + mh - 46, mx + 40 + i * 14, my + mh - 36), radius=3, fill=hue)

# text
x = 80
d.text((x, 92), 'UNOFFICIAL WEB DRIVER', font=ImageFont.truetype(BOLD, 22), fill=ACCENT)
d.text((x, 128), 'AULA S35 PRO', font=ImageFont.truetype(BOLD, 88), fill=TEXT)
d.text((x, 238), 'Mouse settings, right in your browser.', font=ImageFont.truetype(FONT, 38), fill=TEXT)
d.text((x, 290), 'No download, no install.', font=ImageFont.truetype(FONT, 38), fill=MUTED)

chip_font = ImageFont.truetype(FONT, 26)
cx, cy = x, 380
for label in ['DPI', 'RGB lighting', 'Macros', 'Buttons', 'Polling rate']:
    w = d.textlength(label, font=chip_font) + 36
    if cx + w > 780:
        cx, cy = x, cy + 62
    d.rounded_rectangle((cx, cy, cx + w, cy + 46), radius=23, fill=SURFACE, outline=BORDER, width=2)
    d.text((cx + 18, cy + 6), label, font=chip_font, fill=TEXT)
    cx += w + 12

d.text((x, 540), 'Works in Chrome & Edge  ·  2.4G receiver or USB', font=ImageFont.truetype(FONT, 26), fill=MUTED)
img.save('og-image.png', optimize=True)
print('og-image.png', img.size)
