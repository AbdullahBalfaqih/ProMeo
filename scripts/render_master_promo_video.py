import os, sys, math, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

W, H = 1920, 1080
FPS = 25
AUDIO_MASTER = "public/assets/audio/master_3min_voiceover.mp3"
OUTPUT_VIDEO = "public/assets/promeo_product_promo.mp4"
FRAMES_DIR = "/tmp/master_promo_frames"

os.makedirs(FRAMES_DIR, exist_ok=True)

# Scene timing matching audio files
D1 = 30.75  # Act 1: Problem & Market Friction (Envato 5EN4HC8 Kinetic Intro)
D2 = 26.91  # Act 2: The Solution & Mezo Architecture
D3A = 18.26 # Act 3A: Overview Dashboard
D3B = 16.98 # Act 3B: Agent Governance & Policy Engine
D3C = 15.70 # Act 3C: Autonomous Sourcing & Verified Catalog
D3D = 15.70 # Act 3D: Cryptographic EIP-712 Offers & Approvals Queue
D3E = 20.51 # Act 3E: Mezo Smart Contract Escrow Lock & Milestone Release
D4 = 17.32  # Act 4: Tamper-Evident SHA-256 Merkle Ledger
D5 = 18.60  # Act 5: Hackathon Vision & Call to Action

TOTAL_DURATION = D1 + D2 + D3A + D3B + D3C + D3D + D3E + D4 + D5
TOTAL_FRAMES = int(TOTAL_DURATION * FPS)

print(f"Total Duration: {TOTAL_DURATION:.2f}s (~{TOTAL_DURATION/60:.2f} min) | Total Frames: {TOTAL_FRAMES}")

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def get_font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

logo_img = Image.open("public/assets/logo.png").convert("RGBA")
lock_3d = Image.open("public/assets/3d/glass-lock.png").convert("RGBA")
pie_3d = Image.open("public/assets/3d/glass-pie.png").convert("RGBA")
rocket_3d = Image.open("public/assets/3d/glass-rocket.png").convert("RGBA")
shield_3d = Image.open("public/assets/3d/glass-shield.png").convert("RGBA")

# Pre-render Envato 5EN4HC8 Style Luxury Background with Purple & Orange Light Leaks
def create_envato_bg():
    bg = Image.new("RGBA", (W, H), (8, 4, 20, 255))
    draw = ImageDraw.Draw(bg)
    for y in range(H):
        r = int(8 + (18 - 8) * (y / H))
        g = int(4 + (10 - 4) * (y / H))
        b = int(20 + (38 - 20) * (y / H))
        draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

    for gx in range(40, W, 70):
        for gy in range(40, H, 70):
            draw.ellipse((gx, gy, gx+2, gy+2), fill=(109, 63, 234, 35))

    ll = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    lld = ImageDraw.Draw(ll)
    # Warm Vibrant Orange/Amber Light Leak (Top Right / Center)
    lld.ellipse((W - 650, -180, W + 200, 520), fill=(255, 120, 0, 65))
    lld.ellipse((W - 850, 100, W - 250, 600), fill=(255, 160, 30, 45))
    # Electric Purple/Violet Light Leak (Bottom Left & Center)
    lld.ellipse((-200, H - 600, 550, H + 200), fill=(139, 92, 246, 70))
    lld.ellipse((W//2 - 500, H//2 - 300, W//2 + 500, H//2 + 300), fill=(109, 63, 234, 50))
    
    ll = ll.filter(ImageFilter.GaussianBlur(130))
    bg.alpha_composite(ll)
    return bg

envato_bg = create_envato_bg()

def draw_top_nav(im, draw, progress, brand_sub="Autonomous AI Procurement Network · Mezo Chain 31611"):
    lg = logo_img.resize((52, 52), Image.Resampling.LANCZOS)
    im.paste(lg, (100, 50), lg)
    draw.text((168, 54), "ProMeo", fill=(255, 255, 255), font=get_font(28, bold=True))
    draw.text((168, 88), brand_sub, fill=(180, 170, 215), font=get_font(15, bold=False))
    pw = int(W * progress)
    draw.line([(0, 2), (pw, 2)], fill=(139, 92, 246), width=4)

def draw_3d_glass_card(im, x, y, w, h, title, counter_str, sub_str, badge_text, badge_col, progress=1.0):
    card = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    cdraw = ImageDraw.Draw(card)
    cdraw.rounded_rectangle((0, 0, w, h), radius=28, fill=(20, 12, 45, 215), outline=(255, 255, 255, 75), width=2)
    cdraw.line([(30, 2), (w - 30, 2)], fill=(255, 255, 255, 140), width=2)
    
    cdraw.rounded_rectangle((28, 28, 220, 64), radius=99, fill=(badge_col[0], badge_col[1], badge_col[2], 50), outline=badge_col, width=1)
    cdraw.ellipse((42, 42, 50, 50), fill=badge_col)
    cdraw.text((60, 37), badge_text, fill=(255, 255, 255), font=get_font(13, bold=True))
    
    cdraw.text((28, 85), title, fill=(185, 175, 215), font=get_font(16, bold=False))
    cdraw.text((28, 120), counter_str, fill=(255, 255, 255), font=get_font(42, bold=True))
    cdraw.text((28, 185), sub_str, fill=(255, 160, 40), font=get_font(15, bold=True))
    
    pts = [(28, h - 50), (100, h - 75), (180, h - 60), (260, h - 110), (340, h - 85), (420, h - 140), (w - 35, h - 120)]
    max_pts = max(2, int(len(pts) * progress))
    for j in range(max_pts - 1):
        cdraw.line([pts[j], pts[j+1]], fill=(168, 85, 247), width=4)
        cdraw.ellipse((pts[j][0]-4, pts[j][1]-4, pts[j][0]+4, pts[j][1]+4), fill=(255, 160, 40))
    if max_pts > 1:
        cdraw.ellipse((pts[max_pts-1][0]-6, pts[max_pts-1][0]-6, pts[max_pts-1][0]+6, pts[max_pts-1][0]+6), fill=(255, 255, 255))
        
    shadow = Image.new("RGBA", (w + 40, h + 40), (0, 0, 0, 0))
    sdraw = ImageDraw.Draw(shadow)
    sdraw.rounded_rectangle((20, 20, w + 20, h + 20), radius=28, fill=(0, 0, 0, 160))
    shadow = shadow.filter(ImageFilter.GaussianBlur(24))
    
    im.alpha_composite(shadow, (x - 20, y - 20))
    im.alpha_composite(card, (x, y))

def draw_cursor(draw, x, y, clicked=False):
    pts = [(x, y), (x, y+24), (x+6, y+18), (x+12, y+27), (x+16, y+25), (x+10, y+16), (x+18, y+16)]
    fill_col = (255, 255, 255) if not clicked else (109, 63, 234)
    draw.polygon(pts, fill=fill_col, outline=(36, 27, 69))
    if clicked:
        draw.ellipse((x - 14, y - 14, x + 14, y + 14), outline=(109, 63, 234), width=3)

def draw_topbar(im, draw, active_tab_name, active_tab_idx=0):
    # Left Rail (80px)
    draw.rectangle((0, 0, 80, H), fill=(255, 255, 255))
    draw.line([(80, 0), (80, H)], fill=(225, 220, 245), width=1)
    im.paste(logo_img.resize((44, 44), Image.Resampling.LANCZOS), (18, 20), logo_img.resize((44, 44)))
    
    for i in range(8):
        by = 90 + i * 54
        if i == active_tab_idx:
            draw.rounded_rectangle((18, by, 62, by + 44), radius=13, fill=(109, 63, 234))
            draw.ellipse((36, by + 18, 44, by + 26), fill=(255, 255, 255))
        else:
            draw.ellipse((37, by + 19, 43, by + 25), fill=(125, 118, 160))
            
    # Top appbar
    draw.rectangle((80, 0, W, 75), fill=(255, 255, 255))
    draw.line([(80, 75), (W, 75)], fill=(225, 220, 245), width=1)
    
    t_font = get_font(28, bold=True)
    draw.text((115, 24), active_tab_name, fill=(36, 27, 69), font=t_font)
    tw = int(draw.textlength(active_tab_name, font=t_font))
    draw.text((115 + tw + 20, 31), "ProMeo Protocol · Mezo Chain 31611", fill=(125, 118, 160), font=get_font(15, bold=False))
    
    # Appbar pills
    draw.rounded_rectangle((W - 710, 18, W - 470, 56), radius=99, fill=(245, 243, 252), outline=(210, 200, 240))
    draw.ellipse((W - 695, 33, W - 687, 41), fill=(36, 27, 69))
    draw.text((W - 676, 27), "Mezo Oracle: $68,450/BTC", fill=(36, 27, 69), font=get_font(14, bold=True))
    
    draw.rounded_rectangle((W - 455, 18, W - 260, 56), radius=99, fill=(245, 243, 252), outline=(210, 200, 240))
    draw.text((W - 438, 27), "veBTC: 5.2 BTC Locked", fill=(36, 27, 69), font=get_font(14, bold=True))
    
    draw.rounded_rectangle((W - 245, 18, W - 90, 56), radius=99, fill=(245, 243, 252), outline=(210, 200, 240))
    draw.text((W - 225, 27), "0x88ED...B048", fill=(36, 27, 69), font=get_font(14, bold=True))

# ----------------- ACT 1: ENVATO 5EN4HC8 KINETIC INTRO (THE PROBLEM) -----------------
def render_act1(t):
    im = envato_bg.copy()
    draw = ImageDraw.Draw(im)
    draw_top_nav(im, draw, t / TOTAL_DURATION)
    
    # Sub-scene A: 0.0s - 15.0s (The $85B Dilemma & Climbing Metric Counter)
    # Sub-scene B: 15.0s - 30.75s (The 3 Core Structural Failures of Legacy POs)
    
    if t < 15.0:
        p = t / 15.0
        # Climbing counter from 0 to 85,420,000,000
        val = int(85420000000 * min(1.0, p * 1.25))
        counter_str = f"${val:,}"
        
        draw.rounded_rectangle((100, 170, 440, 210), radius=99, fill=(35, 20, 65, 220), outline=(255, 140, 0, 220), width=1)
        draw.ellipse((120, 186, 128, 194), fill=(255, 140, 0))
        draw.text((140, 181), "MARKET RESEARCH & DILEMMA", fill=(255, 200, 120), font=get_font(14, bold=True))
        
        draw.text((100, 235), "The $85 Billion Enterprise AI Bottleneck", fill=(255, 255, 255), font=get_font(52, bold=True))
        draw.text((100, 310), "Autonomous machine fleets require sub-second compute, but legacy purchase orders freeze execution.", fill=(210, 200, 240), font=get_font(22, bold=False))
        
        draw_3d_glass_card(im, 100, 390, 520, 320, "Cloud Compute Blocked by POs", counter_str, "+38% Annual Procurement Friction", "ENTERPRISE CAPITAL", (255, 140, 0), p)
        draw_3d_glass_card(im, 650, 390, 520, 320, "Manual PO Processing Time", "3 - 6 Weeks", "Accelerated to < 1.2s on Mezo", "LATENCY BARRIER", (168, 85, 247), p)
        
        draw.rounded_rectangle((100, 750, 1170, 840), radius=20, fill=(24, 15, 52, 230), outline=(109, 63, 234, 160), width=1)
        draw.text((130, 768), "Zero Corporate Agent Accounts · Unmonitored Credit Leaks · High Counterparty Risk", fill=(255, 255, 255), font=get_font(20, bold=True))
        draw.text((130, 802), "Without non-custodial smart contract escrow, AI machine-to-machine commerce cannot scale.", fill=(190, 180, 225), font=get_font(15, bold=False))
        
        float_y = int(math.sin(t * 2.8) * 14)
        lk = lock_3d.resize((480, 480), Image.Resampling.LANCZOS)
        im.paste(lk, (1320, 260 + float_y), lk)
    else:
        p = (t - 15.0) / 15.75
        draw.rounded_rectangle((100, 170, 480, 210), radius=99, fill=(35, 20, 65, 220), outline=(255, 140, 0, 220), width=1)
        draw.ellipse((120, 186, 128, 194), fill=(255, 140, 0))
        draw.text((140, 181), "WHY TRADITIONAL RAILS BREAK", fill=(255, 200, 120), font=get_font(14, bold=True))
        
        draw.text((100, 235), "Why Traditional Rails Fail Autonomous AI", fill=(255, 255, 255), font=get_font(52, bold=True))
        draw.text((100, 310), "Human bureaucracy is completely mismatched with real-time autonomous agent workflows.", fill=(210, 200, 240), font=get_font(22, bold=False))
        
        cards = [
            ("Manual Approval Friction (3-6 Weeks)", "Enterprises lose critical GPU availability while waiting for corporate purchasing department sign-offs."),
            ("Zero Agent Bank Accounts", "AI agents cannot open fiat banking rails, forcing insecure corporate credit card sharing."),
            ("Crippling Counterparty & Delivery Risk", "Without cryptographic escrow and SLA verification, automated pre-payments lead to unrecoverable disputes.")
        ]
        
        for k, (ct, cd) in enumerate(cards):
            cy = 390 + k * 125
            draw.rounded_rectangle((100, cy, 1170, cy + 105), radius=18, fill=(24, 15, 52, 230), outline=(109, 63, 234, 140), width=1)
            draw.ellipse((130, cy + 28, 146, cy + 44), fill=(255, 140, 0) if k==0 else (168, 85, 247))
            draw.text((170, cy + 20), ct, fill=(255, 255, 255), font=get_font(22, bold=True))
            draw.text((170, cy + 56), cd, fill=(190, 180, 225), font=get_font(15, bold=False))
            
        float_y = int(math.sin(t * 2.8) * 14)
        sh = shield_3d.resize((460, 480), Image.Resampling.LANCZOS)
        im.paste(sh, (1320, 260 + float_y), sh)
        
    return im

# ----------------- ACT 2: THE MEZO SOLUTION & ARCHITECTURE -----------------
def render_act2(t):
    im = envato_bg.copy()
    draw = ImageDraw.Draw(im)
    draw_top_nav(im, draw, (D1 + t) / TOTAL_DURATION)
    
    draw.rounded_rectangle((100, 170, 470, 210), radius=99, fill=(35, 20, 65, 220), outline=(139, 92, 246, 220), width=1)
    draw.ellipse((120, 186, 128, 194), fill=(168, 85, 247))
    draw.text((140, 181), "THE DECENTRALIZED SOLUTION", fill=(220, 200, 255), font=get_font(14, bold=True))
    
    draw.text((100, 235), "Meet ProMeo: Autonomous Agent Procurement", fill=(255, 255, 255), font=get_font(52, bold=True))
    draw.text((100, 310), "Built natively on Mezo Blockchain · Powered by Bitcoin & Programmatic MUSD Escrow", fill=(210, 200, 240), font=get_font(22, bold=False))
    
    pillars = [
        ("Programmatic MUSD Smart Contract Escrow", "Funds locked in non-custodial ProcurementEscrow.sol (0x88ED...B048) until SLA is mathematically proven."),
        ("Mezo Skip BTC/USD Price Oracle Integration", "Real-time Bitcoin pricing ($68,450/BTC via 0x86bC...9366) ensures fair valuation for machine compute workloads."),
        ("veBTC Governance Amplification Staking", "Enterprises with locked veBTC unlock +20% spend capacity boost and priority supplier routing across the network.")
    ]
    
    for i, (title, desc) in enumerate(pillars):
        cy = 390 + i * 125
        draw.rounded_rectangle((100, cy, 1170, cy + 105), radius=18, fill=(24, 15, 52, 230), outline=(139, 92, 246, 140), width=1)
        draw.ellipse((130, cy + 28, 146, cy + 44), fill=(168, 85, 247))
        draw.text((170, cy + 20), title, fill=(255, 255, 255), font=get_font(22, bold=True))
        draw.text((170, cy + 56), desc, fill=(190, 180, 225), font=get_font(15, bold=False))
        
    float_y = int(math.sin(t * 2.8) * 12)
    rk = rocket_3d.resize((430, 520), Image.Resampling.LANCZOS)
    im.paste(rk, (1320, 230 + float_y), rk)
    return im

# ----------------- ACT 3A: OVERVIEW DASHBOARD & METRICS -----------------
def render_act3a(t):
    im = Image.new("RGB", (W, H), (243, 240, 252))
    draw = ImageDraw.Draw(im)
    draw_topbar(im, draw, "Overview", active_tab_idx=0)
    
    p = t / D3A
    cx = int(280 + p * 380)
    cy = int(220 + math.sin(p * math.pi) * 80)
    clicked = (p > 0.4 and p < 0.6)
    
    card_w = (W - 80 - 80) // 3
    card_h = 190
    cards_data = [
        ("Escrow locked on Mezo", "$1,500 MUSD", "1 active agreements", lock_3d),
        ("Audit chain integrity", "100%", "142 verified events", pie_3d),
        ("MUSD settled to vendors", "650 MUSD", "Finalized on Mezo", rocket_3d)
    ]
    
    for i, (label, val, chip, asset_img) in enumerate(cards_data):
        cx_card = 115 + i * (card_w + 20)
        cy_card = 105
        draw.rounded_rectangle((cx_card, cy_card, cx_card + card_w, cy_card + card_h), radius=22, fill=(150, 110, 240), outline=(255, 255, 255), width=1)
        draw.text((cx_card + 24, cy_card + 24), label, fill=(255, 255, 255), font=get_font(15, bold=False))
        draw.text((cx_card + 24, cy_card + 54), val, fill=(255, 255, 255), font=get_font(36, bold=True))
        
        draw.rounded_rectangle((cx_card + 24, cy_card + 135, cx_card + 245, cy_card + 168), radius=99, fill=(185, 150, 250), outline=(255, 255, 255), width=1)
        draw.ellipse((cx_card + 36, cy_card + 148, cx_card + 42, cy_card + 154), fill=(255, 255, 255))
        draw.text((cx_card + 50, cy_card + 142), chip, fill=(255, 255, 255), font=get_font(13, bold=True))
        
        scaled_a = asset_img.resize((145, 145), Image.Resampling.LANCZOS)
        im.paste(scaled_a, (cx_card + card_w - 155, cy_card + 22), scaled_a)
        
    chart_w = int((W - 80 - 60) * 0.65)
    panel_w = (W - 80 - 60) - chart_w - 20
    my, mh = 320, 700
    
    draw.rounded_rectangle((115, my, 115 + chart_w, my + mh), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
    draw.text((145, my + 30), "Network Escrow Volume & Oracle Price", fill=(36, 27, 69), font=get_font(21, bold=True))
    draw.text((145, my + 65), "$557,507 MUSD", fill=(109, 63, 234), font=get_font(32, bold=True))
    
    pts = [(145, my + 450), (280, my + 410), (420, my + 430), (560, my + 340), (700, my + 360), (840, my + 280), (980, my + 300), (1120, my + 210), (1200, my + 190)]
    for j in range(len(pts)-1):
        draw.line([pts[j], pts[j+1]], fill=(109, 63, 234), width=4)
        draw.ellipse((pts[j][0]-4, pts[j][1]-4, pts[j][0]+4, pts[j][1]+4), fill=(109, 63, 234))
        
    rx = 115 + chart_w + 20
    draw.rounded_rectangle((rx, my, rx + panel_w, my + mh), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
    draw.text((rx + 30, my + 30), "Escrow Staking & Allocation", fill=(36, 27, 69), font=get_font(21, bold=True))
    draw.arc((rx + panel_w//2 - 90, my + 90, rx + panel_w//2 + 90, my + 270), start=140, end=400, fill=(109, 63, 234), width=14)
    draw.text((rx + panel_w//2 - 40, my + 160), "74%", fill=(36, 27, 69), font=get_font(36, bold=True))
    draw.text((rx + panel_w//2 - 50, my + 205), "Allocated Pool", fill=(125, 118, 160), font=get_font(14, bold=False))
    
    draw.rounded_rectangle((rx + 30, my + 310, rx + panel_w - 30, my + 365), radius=14, fill=(245, 243, 252), outline=(210, 200, 240))
    draw.text((rx + 46, my + 328), "Amount: 1,500 MUSD", fill=(36, 27, 69), font=get_font(16, bold=False))
    
    draw.rounded_rectangle((rx + 30, my + 390, rx + panel_w - 30, my + 445), radius=14, fill=(109, 63, 234))
    draw.text((rx + panel_w//2 - 80, my + 408), "Lock MUSD in Escrow", fill=(255, 255, 255), font=get_font(19, bold=True))

    draw_cursor(draw, cx, cy, clicked)
    return im

# ----------------- ACT 3B: AGENT GOVERNANCE & POLICY ENGINE -----------------
def render_act3b(t):
    im = Image.new("RGB", (W, H), (243, 240, 252))
    draw = ImageDraw.Draw(im)
    draw_topbar(im, draw, "Agent Governance & Policy Engine", active_tab_idx=7)
    
    p = t / D3B
    cx = int(450 + p * 300)
    cy = int(480 + math.sin(p * math.pi) * 50)
    clicked = (p > 0.45 and p < 0.65)

    draw.rounded_rectangle((115, 105, W - 40, 250), radius=22, fill=(150, 110, 240))
    draw.text((150, 138), "Deterministic Agent Spend Limits on Mezo", fill=(255, 255, 255), font=get_font(32, bold=True))
    draw.text((150, 188), "Cryptographically anchored to AgentPolicyRegistry.sol (0x957d...8ccC) · Zero runaway spend.", fill=(245, 240, 255), font=get_font(18, bold=False))

    draw.rounded_rectangle((115, 280, 950, 980), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
    draw.text((150, 315), "Autonomous Agent: procurement-bot", fill=(36, 27, 69), font=get_font(24, bold=True))
    draw.text((150, 355), "Wallet: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", fill=(125, 118, 160), font=get_font(14, bold=False))

    rules = [
        ("Daily Spend Ceiling", "5,000 MUSD / day", "Enforced by Mezo contract"),
        ("Max Per-Request Budget", "3,000 MUSD / transaction", "Hard cap per RFQ"),
        ("Skip Oracle Pegging", "Max 0.05 BTC eq.", "Indexed dynamically"),
        ("veBTC Policy Boost", "+20% Spend Amplification", "Active tier 2 staking"),
        ("Policy Merkle Hash", "0x3a7f8b91c410e52a90d81f12", "Verified on-chain")
    ]

    for i, (rt, rv, rd) in enumerate(rules):
        y = 410 + i * 105
        draw.line([(150, y), (915, y)], fill=(240, 235, 252), width=1)
        draw.text((150, y + 15), rt, fill=(125, 118, 160), font=get_font(15, bold=False))
        draw.text((150, y + 42), rv, fill=(36, 27, 69), font=get_font(21, bold=True))
        draw.text((620, y + 42), rd, fill=(109, 63, 234), font=get_font(14, bold=True))

    draw.rounded_rectangle((980, 280, W - 40, 980), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
    draw.text((1015, 315), "Cryptographic Policy Attestation", fill=(36, 27, 69), font=get_font(24, bold=True))
    draw.text((1015, 355), "Smart contract verification log on Mezo Chain 31611", fill=(125, 118, 160), font=get_font(14, bold=False))

    steps = [
        ("1. Merkle Tree Root Generated", "SHA-256 tree of org policies, budgets & allowed capabilities"),
        ("2. Stored on Mezo Registry", "Registered in AgentPolicyRegistry.sol at block #16364920"),
        ("3. Autonomous Authorization", "Agent signs transactions with ephemeral key scoped to Merkle root"),
        ("4. Dynamic veBTC Multiplier", "Holders of veBTC token unlock 1.20x spend amplification")
    ]
    for k, (st, sd) in enumerate(steps):
        sy = 420 + k * 125
        draw.rounded_rectangle((1015, sy, W - 75, sy + 100), radius=16, fill=(248, 245, 254), outline=(220, 210, 245))
        draw.text((1040, sy + 22), st, fill=(36, 27, 69), font=get_font(18, bold=True))
        draw.text((1040, sy + 56), sd, fill=(125, 118, 160), font=get_font(14, bold=False))

    draw_cursor(draw, cx, cy, clicked)
    return im

# ----------------- ACT 3C: AUTONOMOUS SOURCING & VERIFIED HARDWARE CATALOG -----------------
def render_act3c(t):
    im = Image.new("RGB", (W, H), (243, 240, 252))
    draw = ImageDraw.Draw(im)
    draw_topbar(im, draw, "Procurement Requests & Sourcing", active_tab_idx=1)
    
    p = t / D3C
    cx = int(350 + p * 600)
    cy = int(450 + math.sin(p * math.pi) * 40)
    clicked = (p > 0.6)

    draw.rounded_rectangle((115, 105, W - 40, 250), radius=22, fill=(150, 110, 240))
    draw.text((150, 138), "Autonomous Compute Discovery & Hardware RFQ", fill=(255, 255, 255), font=get_font(32, bold=True))
    draw.text((150, 188), "Agent procurement-bot broadcasts RFQ specification, matches verified suppliers, and locks SLA.", fill=(245, 240, 255), font=get_font(18, bold=False))

    draw.rounded_rectangle((115, 280, W - 40, 980), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
    draw.text((150, 315), "Active Sourcing Broadcast · REQ-9041 (8x H100 SXM5)", fill=(36, 27, 69), font=get_font(24, bold=True))

    reqs = [
        ("Helios Compute", "Dedicated GPU Cluster (8x H100 SXM5)", "Hardware Manifest: 0x9b4a...12e0", "1,200 MUSD", "Verified Match ✓"),
        ("Zenith Cloud", "8x H100 SXM5 High-Bandwidth Cluster", "Hardware Manifest: 0x2c1f...88a4", "1,350 MUSD", "Verified Match ✓"),
        ("Lambda Labs Fleet", "On-Demand 8x H100 Node (InfiniBand)", "Hardware Manifest: 0x7e33...4b11", "1,420 MUSD", "Verified Match ✓"),
        ("CoreWeave Secure", "Reserved 8x H100 SXM5 Node", "Hardware Manifest: 0x5a18...39d2", "1,480 MUSD", "Verified Match ✓")
    ]

    for k, (v_name, v_title, v_hash, v_price, v_status) in enumerate(reqs):
        ry = 380 + k * 125
        draw.line([(150, ry - 15), (W - 60, ry - 15)], fill=(235, 230, 250), width=1)
        draw.text((150, ry), v_name, fill=(36, 27, 69), font=get_font(20, bold=True))
        draw.text((150, ry + 28), v_hash, fill=(125, 118, 160), font=get_font(14, bold=False))
        draw.text((450, ry + 12), v_title, fill=(36, 27, 69), font=get_font(17, bold=False))
        draw.text((1200, ry + 12), v_price, fill=(36, 27, 69), font=get_font(22, bold=True))
        
        draw.rounded_rectangle((1560, ry + 2, 1820, ry + 42), radius=99, fill=(240, 235, 255), outline=(109, 63, 234))
        tw = int(draw.textlength(v_status, font=get_font(15, bold=True)))
        tx = 1560 + (260 - tw) // 2
        draw.text((tx, ry + 12), v_status, fill=(109, 63, 234), font=get_font(15, bold=True))

    draw_cursor(draw, cx, cy, clicked)
    return im

# ----------------- ACT 3D: EIP-712 OFFERS & APPROVALS QUEUE -----------------
def render_act3d(t):
    im = Image.new("RGB", (W, H), (243, 240, 252))
    draw = ImageDraw.Draw(im)
    draw_topbar(im, draw, "Approvals Queue & EIP-712 Verification", active_tab_idx=2)
    
    p = t / D3D
    cx = int(300 + p * 300)
    cy = int(680 + math.sin(p * math.pi) * 30)
    clicked = (p > 0.65)

    draw.rounded_rectangle((115, 105, W - 40, 250), radius=22, fill=(150, 110, 240))
    draw.text((150, 138), "Cryptographic EIP-712 Offer Verification", fill=(255, 255, 255), font=get_font(32, bold=True))
    draw.text((150, 188), "Supplier Helios Compute signed typed data with EVM key 0x59c6...690d · Policy engine checked.", fill=(245, 240, 255), font=get_font(18, bold=False))

    draw.rounded_rectangle((115, 280, W - 40, 980), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
    draw.text((150, 315), "Pending Supplier Offer: Helios Compute (1,200 MUSD)", fill=(36, 27, 69), font=get_font(24, bold=True))

    checks = [
        ("EIP-712 Typed Data Signature", "Valid signature from Helios vendor wallet (0x59c6...690d)", "Cryptographically Valid ✓"),
        ("Agent Daily Budget Policy", "1,200 MUSD quote is within 5,000 MUSD daily limit", "Policy Check Passed ✓"),
        ("Mezo Skip BTC Oracle Pegging", "Equivalent to 0.0175 BTC at $68,450/BTC feed", "Oracle Valuation Passed ✓"),
        ("Hardware Manifest Attestation", "SHA-256 manifest hash matches 8x H100 SXM5 specs", "SLA Specification Passed ✓")
    ]

    for k, (ct, cd, cs) in enumerate(checks):
        cy = 380 + k * 95
        draw.line([(150, cy - 10), (W - 60, cy - 10)], fill=(235, 230, 250), width=1)
        draw.text((150, cy + 12), ct, fill=(36, 27, 69), font=get_font(18, bold=True))
        draw.text((580, cy + 14), cd, fill=(125, 118, 160), font=get_font(15, bold=False))
        draw.text((1420, cy + 12), cs, fill=(109, 63, 234), font=get_font(16, bold=True))

    btn_x, btn_y = 150, 780
    btn_col = (109, 63, 234) if not clicked else (16, 185, 129)
    btn_txt = "Approve & Authorize Escrow Funding" if not clicked else "✓ Offer Approved & Escrow Funded!"
    draw.rounded_rectangle((btn_x, btn_y, btn_x + 420, btn_y + 55), radius=14, fill=btn_col)
    bw = int(draw.textlength(btn_txt, font=get_font(18, bold=True)))
    draw.text((btn_x + (420 - bw) // 2, btn_y + 16), btn_txt, fill=(255, 255, 255), font=get_font(18, bold=True))

    draw_cursor(draw, cx, cy, clicked)
    return im

# ----------------- ACT 3E: MEZO ESCROW SMART CONTRACT & MILESTONE RELEASE -----------------
def render_act3e(t):
    im = Image.new("RGB", (W, H), (243, 240, 252))
    draw = ImageDraw.Draw(im)
    draw_topbar(im, draw, "Escrow & Settlement Agreements", active_tab_idx=3)
    
    p = t / D3E
    cx = int(220 + p * 140)
    cy = int(680 + math.sin(p * math.pi) * 20)
    clicked = (p > 0.45)

    draw.rounded_rectangle((115, 105, W - 40, 250), radius=22, fill=(150, 110, 240))
    draw.text((150, 138), "Smart Contract Escrow on Mezo Chain 31611", fill=(255, 255, 255), font=get_font(32, bold=True))
    draw.text((150, 188), "Non-custodial MUSD lockup with automated milestone releases upon SLA telemetry verification.", fill=(245, 240, 255), font=get_font(18, bold=False))

    draw.rounded_rectangle((115, 280, W - 40, 680), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
    draw.text((150, 315), "Active Smart Contract Agreement · Position #0x88ED...B048 (1,200 MUSD)", fill=(36, 27, 69), font=get_font(21, bold=True))

    milestones = [
        ("Milestone 1: Cluster Setup & Environment Provisioning (360 MUSD)", "100% Completed", 1.0),
        ("Milestone 2: Workload Execution & Model Weights Hash (480 MUSD)", "100% SLA Verified (Ready)" if clicked else "50% Completed", 1.0 if clicked else 0.5),
        ("Milestone 3: Final Benchmark & SLA Signoff (360 MUSD)", "Pending Release", 0.0)
    ]

    for m, (m_title, m_pct, m_val) in enumerate(milestones):
        my = 380 + m * 90
        draw.text((150, my), m_title, fill=(36, 27, 69), font=get_font(16, bold=False))
        draw.text((W - 280, my), m_pct, fill=(109, 63, 234), font=get_font(15, bold=True))
        bar_w = W - 420
        draw.rounded_rectangle((150, my + 28, 150 + bar_w, my + 40), radius=6, fill=(235, 230, 250))
        if m_val > 0:
            draw.rounded_rectangle((150, my + 28, 150 + int(bar_w * m_val), my + 40), radius=6, fill=(109, 63, 234))

    btn_x, btn_y = 150, 675
    draw.rounded_rectangle((btn_x, btn_y, btn_x + 380, btn_y + 55), radius=14, fill=(109, 63, 234))
    bw = int(draw.textlength("Release Milestone #2 (480 MUSD)", font=get_font(18, bold=True)))
    draw.text((btn_x + (380 - bw) // 2, btn_y + 16), "Release Milestone #2 (480 MUSD)", fill=(255, 255, 255), font=get_font(18, bold=True))

    if clicked:
        tx_x, tx_y = W - 660, 780
        draw.rounded_rectangle((tx_x, tx_y, tx_x + 600, tx_y + 95), radius=18, fill=(36, 27, 69), outline=(139, 92, 246), width=2)
        draw.ellipse((tx_x + 24, tx_y + 34, tx_x + 46, tx_y + 56), fill=(139, 92, 246))
        draw.text((tx_x + 60, tx_y + 22), "Milestone Released on Mezo Chain 31611!", fill=(255, 255, 255), font=get_font(18, bold=True))
        draw.text((tx_x + 60, tx_y + 54), "Tx: 0x7c9a81f34d8e...3f12 · 480 MUSD Settled to Helios", fill=(210, 200, 245), font=get_font(15, bold=False))

    draw_cursor(draw, cx, cy, clicked)
    return im

# ----------------- ACT 4: TAMPER-EVIDENT SHA-256 MERKLE LEDGER -----------------
def render_act4(t):
    im = Image.new("RGB", (W, H), (243, 240, 252))
    draw = ImageDraw.Draw(im)
    draw_topbar(im, draw, "Audit & Dispute Trail (Merkle Chain)", active_tab_idx=4)

    draw.rounded_rectangle((115, 105, W - 40, 250), radius=22, fill=(150, 110, 240))
    draw.text((150, 138), "Tamper-Evident SHA-256 Cryptographic Audit Trail", fill=(255, 255, 255), font=get_font(32, bold=True))
    draw.text((150, 188), "Every procurement step is immutably chained into mathematical proofs on Mezo Chain 31611.", fill=(245, 240, 255), font=get_font(18, bold=False))

    draw.rounded_rectangle((115, 280, W - 40, 980), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
    draw.text((150, 315), "Sequential State Transitions & Hashes", fill=(36, 27, 69), font=get_font(24, bold=True))

    audit_entries = [
        ("Block #16364920", "Procurement Request RFQ Broadcast", "REQ-9041 (8x H100 SXM5)", "Hash: 0x4f128c7e91a0...33c9", "Verified ✓"),
        ("Block #16364924", "EIP-712 Supplier Offer Cryptographically Signed", "Helios Compute (1,200 MUSD)", "Sig: 0x9b88e14f2a71...90d2", "Verified ✓"),
        ("Block #16364928", "Agent Policy Merkle Check & Spend Validation", "Passed (< 5,000 MUSD cap)", "Hash: 0x1c3a882f09d1...7e41", "Verified ✓"),
        ("Block #16364935", "Non-Custodial Escrow MUSD Deposit Created", "1,200 MUSD Locked in Escrow", "Tx: 0x88edbf3e966b...b048", "Confirmed ✓"),
        ("Block #16364942", "SLA Telemetry & Model Weights Attestation", "99.99% Uptime SLA Verified", "Root: 0x6e22e91af841...c019", "Verified ✓"),
        ("Block #16364950", "Milestone #2 Release & Supplier Settlement", "480 MUSD Settled to Helios", "Tx: 0x7c9a81f34d8e...3f12", "Finalized ✓")
    ]

    for m, (b_num, b_action, b_detail, b_hash, b_status) in enumerate(audit_entries):
        ay = 370 + m * 95
        draw.line([(150, ay - 10), (W - 60, ay - 10)], fill=(235, 230, 250), width=1)
        draw.text((150, ay + 12), b_num, fill=(125, 118, 160), font=get_font(14, bold=False))
        draw.text((310, ay + 10), b_action, fill=(36, 27, 69), font=get_font(18, bold=True))
        draw.text((820, ay + 12), b_detail, fill=(125, 118, 160), font=get_font(15, bold=False))
        draw.text((1180, ay + 12), b_hash, fill=(109, 63, 234), font=get_font(14, bold=True))
        draw.rounded_rectangle((1620, ay + 6, 1780, ay + 42), radius=99, fill=(240, 235, 255), outline=(109, 63, 234))
        draw.text((1645, ay + 12), b_status, fill=(109, 63, 234), font=get_font(14, bold=True))

    return im

# ----------------- ACT 5: VISION & CALL TO ACTION -----------------
def render_act5(t):
    im = envato_bg.copy()
    draw = ImageDraw.Draw(im)
    draw_top_nav(im, draw, 1.0)

    lg_big = logo_img.resize((140, 140), Image.Resampling.LANCZOS)
    im.paste(lg_big, (W//2 - 70, 220), lg_big)

    draw.text((W//2 - 390, 395), "Power Your Autonomous AI Fleet", fill=(255, 255, 255), font=get_font(52, bold=True))
    draw.text((W//2 - 320, 475), "Built on Mezo · Powered by Bitcoin & MUSD", fill=(210, 200, 240), font=get_font(23, bold=False))

    badges = [
        ("Mezo Chain 31611", "Testnet Settlement Live"),
        ("Non-Custodial Escrow", "Programmatic MUSD Safety"),
        ("Skip BTC Oracle", "$68,450/BTC Dynamic Feed")
    ]

    bx = W//2 - 450
    for i, (b1, b2) in enumerate(badges):
        x = bx + i * 310
        draw.rounded_rectangle((x, 555, x + 280, 650), radius=16, fill=(30, 20, 60, 220), outline=(109, 63, 234, 160), width=1)
        draw.text((x + 22, 577), b1, fill=(255, 255, 255), font=get_font(19, bold=True))
        draw.text((x + 22, 611), b2, fill=(180, 170, 210), font=get_font(14, bold=False))

    draw.text((W//2 - 180, 720), "https://promeo.network", fill=(255, 140, 0), font=get_font(28, bold=True))
    draw.text((W//2 - 270, 780), "Open Source Repository · Verified Contract Deployments", fill=(190, 180, 225), font=get_font(16, bold=False))

    return im

print("Starting Master 3-Minute Promo Render Loop...")

T_CUM = [
    D1,
    D1 + D2,
    D1 + D2 + D3A,
    D1 + D2 + D3A + D3B,
    D1 + D2 + D3A + D3B + D3C,
    D1 + D2 + D3A + D3B + D3C + D3D,
    D1 + D2 + D3A + D3B + D3C + D3D + D3E,
    D1 + D2 + D3A + D3B + D3C + D3D + D3E + D4,
    TOTAL_DURATION
]

for i in range(TOTAL_FRAMES):
    t_global = i / FPS
    
    if t_global < T_CUM[0]:
        frame = render_act1(t_global)
    elif t_global < T_CUM[1]:
        frame = render_act2(t_global - T_CUM[0])
    elif t_global < T_CUM[2]:
        frame = render_act3a(t_global - T_CUM[1])
    elif t_global < T_CUM[3]:
        frame = render_act3b(t_global - T_CUM[2])
    elif t_global < T_CUM[4]:
        frame = render_act3c(t_global - T_CUM[3])
    elif t_global < T_CUM[5]:
        frame = render_act3d(t_global - T_CUM[4])
    elif t_global < T_CUM[6]:
        frame = render_act3e(t_global - T_CUM[5])
    elif t_global < T_CUM[7]:
        frame = render_act4(t_global - T_CUM[6])
    else:
        frame = render_act5(t_global - T_CUM[7])
        
    out_file = os.path.join(FRAMES_DIR, f"frame_{i:05d}.jpg")
    frame.convert("RGB").save(out_file, quality=90)
    
    if i % 250 == 0:
        print(f"Rendered {i}/{TOTAL_FRAMES} frames ({i*100//TOTAL_FRAMES}%)")

print("All frames rendered successfully! Running FFmpeg encoding...")

cmd = [
    "ffmpeg", "-y",
    "-r", str(FPS),
    "-i", os.path.join(FRAMES_DIR, "frame_%05d.jpg"),
    "-i", AUDIO_MASTER,
    "-c:v", "libx264",
    "-pix_fmt", "yuv420p",
    "-c:a", "aac",
    "-b:a", "192k",
    "-shortest",
    OUTPUT_VIDEO
]

res = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
if res.returncode == 0:
    print(f"Master 3-Minute SaaS Promo Video encoded successfully at {OUTPUT_VIDEO}!")
else:
    print("FFmpeg error:", res.stderr[-500:])
