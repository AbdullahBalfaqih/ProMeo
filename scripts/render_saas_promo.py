import os, sys, math, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

# Video configuration
W, H = 1920, 1080
FPS = 25
AUDIO_PATH = "public/assets/audio/full_voiceover.mp3"
OUTPUT_VIDEO = "public/assets/promeo_product_promo.mp4"
FRAMES_DIR = "/tmp/promo_frames"

os.makedirs(FRAMES_DIR, exist_ok=True)

# Durations matching audio clips
D1 = 14.11 # Problem
D2 = 14.42 # Solution
D3 = 13.48 # Why & Value Added
D4 = 17.32 # MacBook Demo
D5 = 5.46  # CTA
TOTAL_DURATION = D1 + D2 + D3 + D4 + D5
TOTAL_FRAMES = int(TOTAL_DURATION * FPS)

print(f"Total Duration: {TOTAL_DURATION:.2f}s, Total Frames: {TOTAL_FRAMES}")

# Fonts
FONT_BOLD_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def get_font(size, bold=False):
    path = FONT_BOLD_PATH if bold else FONT_REG_PATH
    try:
        return ImageFont.truetype(path, size)
    except:
        return ImageFont.load_default()

font_title = get_font(52, bold=True)
font_sub = get_font(26, bold=False)
font_body = get_font(22, bold=False)
font_badge = get_font(18, bold=True)
font_stat_num = get_font(42, bold=True)
font_stat_lbl = get_font(17, bold=False)

# Load assets
logo_img = Image.open("public/assets/logo.png").convert("RGBA").resize((72, 72), Image.Resampling.LANCZOS)
lock_3d = Image.open("public/assets/3d/glass-lock.png").convert("RGBA")
pie_3d = Image.open("public/assets/3d/glass-pie.png").convert("RGBA")
rocket_3d = Image.open("public/assets/3d/glass-rocket.png").convert("RGBA")
shield_3d = Image.open("public/assets/3d/glass-shield.png").convert("RGBA")
screen_img = Image.open("/tmp/arena-coding-uploads/image-6.png").convert("RGBA")

# Pre-render Background base gradient
bg_base = Image.new("RGBA", (W, H), (12, 7, 30, 255))
bg_draw = ImageDraw.Draw(bg_base)
# Subtle diagonal gradient
for y in range(H):
    r = int(12 + (28 - 12) * (y / H))
    g = int(7 + (15 - 7) * (y / H))
    b = int(30 + (55 - 30) * (y / H))
    bg_draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

# Ambient glow overlay
glow_layer = Image.new("RGBA", (W, H), (0, 0, 0, 0))
gdraw = ImageDraw.Draw(glow_layer)
gdraw.ellipse((W//2 - 550, -100, W//2 + 550, 600), fill=(109, 63, 234, 40))
gdraw.ellipse((W - 400, H - 400, W + 300, H + 300), fill=(140, 90, 255, 30))
glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(100))
bg_base.alpha_composite(glow_layer)

def draw_header(im, draw, progress):
    # Brand logo & title at top-left
    im.paste(logo_img, (100, 60), logo_img)
    draw.text((190, 72), "ProMeo", fill=(255, 255, 255, 255), font=get_font(32, bold=True))
    draw.text((190, 110), "Autonomous AI Procurement Network · Mezo Chain 31611", fill=(180, 170, 215, 255), font=get_font(16, bold=False))
    
    # Progress bar at top edge
    bar_w = int(W * progress)
    draw.line([(0, 2), (bar_w, 2)], fill=(139, 92, 246, 255), width=4)

def render_scene_1(t, dur):
    # Problem & Market Size
    im = bg_base.copy()
    draw = ImageDraw.Draw(im)
    draw_header(im, draw, t / TOTAL_DURATION)
    
    # Eyebrow
    badge_text = "THE ENTERPRISE AI DILEMMA"
    draw.rounded_rectangle((100, 180, 480, 218), radius=99, fill=(40, 25, 75, 200), outline=(109, 63, 234, 180), width=1)
    draw.text((125, 189), badge_text, fill=(210, 190, 255, 255), font=font_badge)
    
    # Headline
    draw.text((100, 240), "$85B+ AI Cloud & Compute Market", fill=(255, 255, 255, 255), font=font_title)
    draw.text((100, 310), "Paralyzed by Legacy Manual Procurement & Counterparty Risk", fill=(180, 170, 210, 255), font=font_sub)
    
    # 3 Pain points cards
    cards = [
        ("Traditional PO Cycles", "Human procurement takes 3 to 6 weeks for GPU clusters, stalling autonomous agent swarms."),
        ("Zero Bank Accounts", "AI agents cannot open corporate banking rails, creating dangerous shared credit card leaks."),
        ("No Counterparty Trust", "Unverified service delivery leads to payment disputes and SLA failure without escrow.")
    ]
    
    card_y = 400
    for i, (title, desc) in enumerate(cards):
        cy = card_y + i * 140
        draw.rounded_rectangle((100, cy, 1050, cy + 115), radius=18, fill=(25, 18, 52, 210), outline=(84, 58, 170, 120), width=1)
        # Bullet indicator
        draw.ellipse((130, cy + 28, 146, cy + 44), fill=(109, 63, 234, 255))
        draw.text((170, cy + 22), title, fill=(255, 255, 255, 255), font=get_font(24, bold=True))
        draw.text((170, cy + 60), desc, fill=(180, 175, 205, 255), font=get_font(18, bold=False))
        
    # Floating 3D Visual on right with gentle float
    float_offset = int(math.sin(t * 2.5) * 12)
    lock_scaled = lock_3d.resize((480, 480), Image.Resampling.LANCZOS)
    im.paste(lock_scaled, (1260, 280 + float_offset), lock_scaled)
    
    # Stat callout pill
    draw.rounded_rectangle((1320, 780, 1700, 860), radius=20, fill=(35, 22, 70, 240), outline=(139, 92, 246, 160), width=1)
    draw.text((1350, 795), "3-6 Weeks → < 2 Seconds", fill=(255, 255, 255, 255), font=get_font(20, bold=True))
    draw.text((1350, 825), "Autonomous Sourcing Acceleration", fill=(190, 180, 225, 255), font=get_font(14, bold=False))
    
    return im

def render_scene_2(t, dur):
    # The Solution: ProMeo APN
    im = bg_base.copy()
    draw = ImageDraw.Draw(im)
    draw_header(im, draw, (D1 + t) / TOTAL_DURATION)
    
    # Eyebrow
    badge_text = "THE REVOLUTIONARY SOLUTION"
    draw.rounded_rectangle((100, 180, 480, 218), radius=99, fill=(40, 25, 75, 200), outline=(109, 63, 234, 180), width=1)
    draw.text((125, 189), badge_text, fill=(210, 190, 255, 255), font=font_badge)
    
    # Headline
    draw.text((100, 240), "ProMeo: Autonomous Agent Procurement", fill=(255, 255, 255, 255), font=font_title)
    draw.text((100, 310), "Powered by Mezo Blockchain & Non-Custodial MUSD Smart Contracts", fill=(180, 170, 210, 255), font=font_sub)
    
    # 3 Solution pillars
    pillars = [
        ("Programmatic MUSD Escrow", "Funds locked in smart contract positions (0x88ED...B048) until SLA delivery is attested."),
        ("Skip BTC/USD Oracle Integration", "Dynamic real-time Bitcoin pricing ($68,450/BTC) powers fair compute valuation."),
        ("veBTC Governance Amplification", "Holders of veBTC unlock +20% spend boost and priority agent sourcing tiers.")
    ]
    
    card_y = 400
    for i, (title, desc) in enumerate(pillars):
        cy = card_y + i * 140
        draw.rounded_rectangle((100, cy, 1050, cy + 115), radius=18, fill=(25, 18, 52, 210), outline=(84, 58, 170, 120), width=1)
        draw.ellipse((130, cy + 28, 146, cy + 44), fill=(109, 63, 234, 255))
        draw.text((170, cy + 22), title, fill=(255, 255, 255, 255), font=get_font(24, bold=True))
        draw.text((170, cy + 60), desc, fill=(180, 175, 205, 255), font=get_font(18, bold=False))
        
    # Floating 3D Rocket & Pie
    float_offset = int(math.sin(t * 2.5) * 10)
    rocket_scaled = rocket_3d.resize((420, 520), Image.Resampling.LANCZOS)
    im.paste(rocket_scaled, (1320, 240 + float_offset), rocket_scaled)
    
    return im

def render_scene_3(t, dur):
    # Why ProMeo & The Value Added
    im = bg_base.copy()
    draw = ImageDraw.Draw(im)
    draw_header(im, draw, (D1 + D2 + t) / TOTAL_DURATION)
    
    # Eyebrow
    badge_text = "ENTERPRISE VALUE ADDED"
    draw.rounded_rectangle((100, 180, 480, 218), radius=99, fill=(40, 25, 75, 200), outline=(109, 63, 234, 180), width=1)
    draw.text((125, 189), badge_text, fill=(210, 190, 255, 255), font=font_badge)
    
    # Headline
    draw.text((100, 240), "Why ProMeo? Mathematical Certainty", fill=(255, 255, 255, 255), font=font_title)
    draw.text((100, 310), "Eliminate 100% of Counterparty Risk with Cryptographic Verification", fill=(180, 170, 210, 255), font=font_sub)
    
    # Value Cards
    v_cards = [
        ("Zero Counterparty Risk", "Non-custodial smart contracts hold MUSD; vendors get guaranteed pay, buyers get refund windows."),
        ("Sub-Second Settlement Velocity", "AI agents discover, quote, and settle cloud resources autonomously in real time."),
        ("Tamper-Evident SHA-256 Merkle Ledger", "Every quote, policy check, and release is chained into an immutable audit proof.")
    ]
    
    card_y = 400
    for i, (title, desc) in enumerate(v_cards):
        cy = card_y + i * 140
        draw.rounded_rectangle((100, cy, 1050, cy + 115), radius=18, fill=(25, 18, 52, 210), outline=(84, 58, 170, 120), width=1)
        draw.ellipse((130, cy + 28, 146, cy + 44), fill=(109, 63, 234, 255))
        draw.text((170, cy + 22), title, fill=(255, 255, 255, 255), font=get_font(24, bold=True))
        draw.text((170, cy + 60), desc, fill=(180, 175, 205, 255), font=get_font(18, bold=False))
        
    # Floating 3D Shield
    float_offset = int(math.sin(t * 2.5) * 10)
    shield_scaled = shield_3d.resize((440, 480), Image.Resampling.LANCZOS)
    im.paste(shield_scaled, (1300, 270 + float_offset), shield_scaled)
    
    return im

def render_scene_4(t, dur):
    # MacBook Pro Live Demo Walkthrough
    im = bg_base.copy()
    draw = ImageDraw.Draw(im)
    draw_header(im, draw, (D1 + D2 + D3 + t) / TOTAL_DURATION)
    
    # Title above MacBook
    draw.text((W//2 - 320, 140), "ProMeo Console · Live Testnet Walkthrough", fill=(255, 255, 255, 255), font=get_font(30, bold=True))
    draw.text((W//2 - 240, 180), "Mezo Chain ID 31611 · Programmatic MUSD Escrow", fill=(180, 170, 215, 255), font=get_font(16, bold=False))
    
    # MacBook dimensions
    mw, mh = 1200, 750
    mx = (W - mw) // 2
    my = 220
    
    # Drop shadow
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.ellipse((mx - 50, my + mh + 10, mx + mw + 50, my + mh + 70), fill=(0, 0, 0, 180))
    shadow = shadow.filter(ImageFilter.GaussianBlur(35))
    im.alpha_composite(shadow)
    
    # Screen lid
    draw.rounded_rectangle((mx, my, mx + mw, my + mh), radius=20, fill=(24, 24, 28, 255), outline=(75, 75, 85, 255), width=2)
    
    # UI Screen content
    bezel = 18
    sx = mx + bezel
    sy = my + bezel
    sw = mw - 2 * bezel
    sh = mh - 2 * bezel
    
    # Sub-scene pacing inside the demo:
    # 0 - 6s: Overview cards & live stats
    # 6 - 12s: Sourcing & Requests
    # 12 - 17.3s: Escrow execution
    ui_scaled = screen_img.resize((sw, sh), Image.Resampling.LANCZOS)
    im.paste(ui_scaled, (sx, sy))
    
    # Camera notch
    nx = mx + mw//2 - 35
    draw.rounded_rectangle((nx, my + bezel - 2, nx + 70, my + bezel + 12), radius=4, fill=(18, 18, 20, 255))
    draw.ellipse((nx + 32, my + bezel + 2, nx + 38, my + bezel + 8), fill=(8, 12, 18, 255))
    
    # MacBook aluminum base
    bx1 = mx - 50
    bx2 = mx + mw + 50
    by1 = my + mh
    by2 = by1 + 16
    draw.rounded_rectangle((bx1, by1, bx2, by2), radius=6, fill=(175, 178, 186, 255), outline=(120, 122, 130, 255), width=1)
    # Thumb notch
    draw.rounded_rectangle((W//2 - 50, by1, W//2 + 50, by1 + 5), radius=3, fill=(130, 132, 140, 255))
    # Lip highlight
    draw.line([(bx1 + 12, by2 - 1), (bx2 - 12, by2 - 1)], fill=(225, 227, 235, 255), width=1)
    
    # Dynamic feature highlight tag floating next to laptop
    if t < 6.0:
        tag_text = "Live MUSD Escrow Lock ($1,500)"
        sub_text = "Smart Contract 0x88ED...B048"
    elif t < 12.0:
        tag_text = "100% Cryptographic Audit Chain"
        sub_text = "SHA-256 Merkle verified events"
    else:
        tag_text = "Sub-Second Vendor Settlement"
        sub_text = "Instant milestone release on Mezo"
        
    tag_x = 100
    tag_y = 560
    draw.rounded_rectangle((tag_x, tag_y, tag_x + 360, tag_y + 86), radius=16, fill=(28, 18, 56, 240), outline=(139, 92, 246, 180), width=1)
    draw.ellipse((tag_x + 22, tag_y + 24, tag_x + 38, tag_y + 40), fill=(109, 63, 234, 255))
    draw.text((tag_x + 50, tag_y + 18), tag_text, fill=(255, 255, 255, 255), font=get_font(18, bold=True))
    draw.text((tag_x + 50, tag_y + 48), sub_text, fill=(185, 175, 215, 255), font=get_font(14, bold=False))
    
    return im

def render_scene_5(t, dur):
    # Call to Action & Conclusion
    im = bg_base.copy()
    draw = ImageDraw.Draw(im)
    draw_header(im, draw, 1.0)
    
    # Center Logo
    big_logo = logo_img.resize((120, 120), Image.Resampling.LANCZOS)
    im.paste(big_logo, (W//2 - 60, 260), big_logo)
    
    # Headline
    draw.text((W//2 - 340, 420), "Power Your Autonomous Fleet", fill=(255, 255, 255, 255), font=font_title)
    draw.text((W//2 - 300, 500), "Built on Mezo · Powered by Bitcoin & MUSD", fill=(190, 180, 225, 255), font=font_sub)
    
    # 3 Badges
    badges = [
        ("Chain ID 31611", "Mezo Testnet Active"),
        ("MUSD Escrow", "Non-Custodial Settlement"),
        ("Skip BTC Oracle", "$68,450/BTC Dynamic")
    ]
    
    bx = W//2 - 420
    for i, (b1, b2) in enumerate(badges):
        x = bx + i * 290
        draw.rounded_rectangle((x, 580, x + 260, 670), radius=16, fill=(30, 20, 60, 220), outline=(109, 63, 234, 150), width=1)
        draw.text((x + 20, 598), b1, fill=(255, 255, 255, 255), font=get_font(20, bold=True))
        draw.text((x + 20, 632), b2, fill=(180, 170, 210, 255), font=get_font(14, bold=False))
        
    draw.text((W//2 - 180, 740), "https://promeo.network", fill=(139, 92, 246, 255), font=get_font(24, bold=True))
    
    return im

print("Rendering video frames...")
frame_idx = 0

for i in range(TOTAL_FRAMES):
    t_global = i / FPS
    
    if t_global < D1:
        # Scene 1
        t_scene = t_global
        frame = render_scene_1(t_scene, D1)
    elif t_global < D1 + D2:
        # Scene 2
        t_scene = t_global - D1
        frame = render_scene_2(t_scene, D2)
    elif t_global < D1 + D2 + D3:
        # Scene 3
        t_scene = t_global - (D1 + D2)
        frame = render_scene_3(t_scene, D3)
    elif t_global < D1 + D2 + D3 + D4:
        # Scene 4
        t_scene = t_global - (D1 + D2 + D3)
        frame = render_scene_4(t_scene, D4)
    else:
        # Scene 5
        t_scene = t_global - (D1 + D2 + D3 + D4)
        frame = render_scene_5(t_scene, D5)
        
    out_path = os.path.join(FRAMES_DIR, f"frame_{i:05d}.jpg")
    frame.convert("RGB").save(out_path, quality=90)
    
    if i % 100 == 0:
        print(f"Rendered {i}/{TOTAL_FRAMES} frames ({i*100//TOTAL_FRAMES}%)")

print("All frames rendered! Encoding MP4 with FFmpeg...")

cmd = [
    "ffmpeg", "-y",
    "-r", str(FPS),
    "-i", os.path.join(FRAMES_DIR, "frame_%05d.jpg"),
    "-i", AUDIO_PATH,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    OUTPUT_VIDEO
]

res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
if res.returncode == 0:
    print(f"Promo video generated successfully at {OUTPUT_VIDEO}!")
else:
    print("FFmpeg error:", res.stderr[-500:])
