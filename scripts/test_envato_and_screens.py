import os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

W, H = 1920, 1080
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def get_font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

logo_img = Image.open("public/assets/logo.png").convert("RGBA")
lock_3d = Image.open("public/assets/3d/glass-lock.png").convert("RGBA")
pie_3d = Image.open("public/assets/3d/glass-pie.png").convert("RGBA")
rocket_3d = Image.open("public/assets/3d/glass-rocket.png").convert("RGBA")
shield_3d = Image.open("public/assets/3d/glass-shield.png").convert("RGBA")

# 1. Envato 5EN4HC8 Style Luxury Background with Purple & Orange Light Leaks
def create_envato_bg():
    bg = Image.new("RGBA", (W, H), (8, 4, 20, 255))
    draw = ImageDraw.Draw(bg)
    # Subtle deep dark gradient
    for y in range(H):
        r = int(8 + (18 - 8) * (y / H))
        g = int(4 + (10 - 4) * (y / H))
        b = int(20 + (38 - 20) * (y / H))
        draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

    # Dot grid
    for gx in range(40, W, 70):
        for gy in range(40, H, 70):
            draw.ellipse((gx, gy, gx+2, gy+2), fill=(109, 63, 234, 35))

    # Light leak layer
    ll = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    lld = ImageDraw.Draw(ll)
    
    # 1. Warm Vibrant Orange/Amber Light Leak (Top Right / Center)
    lld.ellipse((W - 650, -180, W + 200, 520), fill=(255, 120, 0, 65))
    lld.ellipse((W - 850, 100, W - 250, 600), fill=(255, 160, 30, 45))
    
    # 2. Electric Purple/Violet Light Leak (Bottom Left & Center)
    lld.ellipse((-200, H - 600, 550, H + 200), fill=(139, 92, 246, 70))
    lld.ellipse((W//2 - 500, H//2 - 300, W//2 + 500, H//2 + 300), fill=(109, 63, 234, 50))
    
    # Soft Gaussian blur for ultra-smooth atmospheric light leak
    ll = ll.filter(ImageFilter.GaussianBlur(130))
    bg.alpha_composite(ll)
    return bg

envato_bg = create_envato_bg()

# Draw 3D Floating Glass Perspective Card (Envato Mockup style)
def draw_3d_glass_card(im, x, y, w, h, title, counter_str, sub_str, badge_text, badge_col):
    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(card)
    
    # Dark frosted glass fill
    cdraw.rounded_rectangle((0, 0, w, h), radius=28, fill=(20, 12, 45, 215), outline=(255, 255, 255, 75), width=2)
    # Specular top gradient line
    cdraw.line([(30, 2), (w - 30, 2)], fill=(255, 255, 255, 140), width=2)
    
    # Badge
    cdraw.rounded_rectangle((28, 28, 220, 64), radius=99, fill=(badge_col[0], badge_col[1], badge_col[2], 50), outline=badge_col, width=1)
    cdraw.ellipse((42, 42, 50, 50), fill=badge_col)
    cdraw.text((60, 37), badge_text, fill=(255, 255, 255), font=get_font(13, bold=True))
    
    cdraw.text((28, 85), title, fill=(185, 175, 215), font=get_font(16, bold=False))
    cdraw.text((28, 120), counter_str, fill=(255, 255, 255), font=get_font(44, bold=True))
    cdraw.text((28, 185), sub_str, fill=(255, 160, 40), font=get_font(16, bold=True))
    
    # Animated chart inside card
    pts = [(28, h - 50), (100, h - 75), (180, h - 60), (260, h - 110), (340, h - 85), (420, h - 140), (w - 35, h - 120)]
    for j in range(len(pts) - 1):
        cdraw.line([pts[j], pts[j+1]], fill=(168, 85, 247), width=4)
        cdraw.ellipse((pts[j][0]-4, pts[j][1]-4, pts[j][0]+4, pts[j][1]+4), fill=(255, 160, 40))
    cdraw.ellipse((pts[-1][0]-6, pts[-1][1]-6, pts[-1][0]+6, pts[-1][1]+6), fill=(255, 255, 255))
    
    # Drop shadow
    shadow = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle((20, 20, w + 20, h + 20), radius=28, fill=(0, 0, 0, 160))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    
    im.alpha_composite(shadow, (x - 20, y - 20))
    im.alpha_composite(card, (x, y))

# Test Envato Intro frame
test_intro = envato_bg.copy()
t_draw = ImageDraw.Draw(test_intro)

# Top brand
test_intro.paste(logo_img.resize((56, 56), Image.Resampling.LANCZOS), (100, 50), logo_img.resize((56, 56)))
t_draw.text((172, 54), "ProMeo", fill=(255, 255, 255), font=get_font(30, bold=True))
t_draw.text((172, 90), "Autonomous AI Procurement Network · Mezo Chain 31611", fill=(200, 185, 235), font=get_font(15, bold=False))

# Massive kinetic typography
t_draw.rounded_rectangle((100, 170, 440, 210), radius=99, fill=(35, 20, 65, 220), outline=(255, 140, 0, 220), width=1)
t_draw.ellipse((120, 186, 128, 194), fill=(255, 140, 0))
t_draw.text((140, 181), "MARKET RESEARCH & DILEMMA", fill=(255, 200, 120), font=get_font(14, bold=True))

t_draw.text((100, 235), "The $85 Billion Enterprise AI Bottleneck", fill=(255, 255, 255), font=get_font(52, bold=True))
t_draw.text((100, 310), "Autonomous machine fleets require sub-second compute, but legacy purchase orders freeze execution.", fill=(210, 200, 240), font=get_font(22, bold=False))

# Left side Envato metric cards
draw_3d_glass_card(test_intro, 100, 390, 520, 320, "Cloud Compute Blocked by POs", "$85,420,000,000", "+38% Annual Procurement Friction", "ENTERPRISE CAPITAL", (255, 140, 0))
draw_3d_glass_card(test_intro, 650, 390, 520, 320, "Manual PO Processing Time", "3 - 6 Weeks", "Accelerated to < 1.2s on Mezo", "LATENCY BARRIER", (168, 85, 247))

# Bottom value strip
t_draw.rounded_rectangle((100, 750, 1170, 840), radius=20, fill=(24, 15, 52, 230), outline=(109, 63, 234, 160), width=1)
t_draw.text((130, 768), "Zero Corporate Agent Accounts · Unmonitored Credit Leaks · High Counterparty Risk", fill=(255, 255, 255), font=get_font(20, bold=True))
t_draw.text((130, 802), "Without non-custodial smart contract escrow, AI machine-to-machine commerce cannot scale.", fill=(190, 180, 225), font=get_font(15, bold=False))

# Floating 3D elements on right
lk = lock_3d.resize((480, 480), Image.Resampling.LANCZOS)
test_intro.paste(lk, (1320, 260), lk)

test_intro.convert("RGB").save("/tmp/test_envato_intro.jpg", quality=95)
print("Saved /tmp/test_envato_intro.jpg")
