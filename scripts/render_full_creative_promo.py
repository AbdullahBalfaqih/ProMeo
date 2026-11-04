import os, sys, math, subprocess
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import numpy as np

W, H = 1920, 1080
FPS = 25
AUDIO_PATH = "public/assets/audio/full_voiceover.mp3"
OUTPUT_VIDEO = "public/assets/promeo_product_promo.mp4"
FRAMES_DIR = "/tmp/promo_creative_frames"

os.makedirs(FRAMES_DIR, exist_ok=True)

# Scene timing matching voiceover exactly
D1 = 14.11 # The Problem
D2 = 14.42 # The Solution
D3 = 13.48 # Value Added
D4 = 17.32 # Full-Screen Live UI Demo (NO MacBook)
D5 = 5.46  # Outro / CTA
TOTAL_DURATION = D1 + D2 + D3 + D4 + D5
TOTAL_FRAMES = int(TOTAL_DURATION * FPS)

print(f"Total Duration: {TOTAL_DURATION:.2f}s | Total Frames: {TOTAL_FRAMES}")

# Fonts
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def get_font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

font_hero = get_font(52, bold=True)
font_title = get_font(38, bold=True)
font_sub = get_font(23, bold=False)
font_card_t = get_font(21, bold=True)
font_card_d = get_font(16, bold=False)
font_badge = get_font(16, bold=True)

# Load assets
logo_img = Image.open("public/assets/logo.png").convert("RGBA")
lock_3d = Image.open("public/assets/3d/glass-lock.png").convert("RGBA")
pie_3d = Image.open("public/assets/3d/glass-pie.png").convert("RGBA")
rocket_3d = Image.open("public/assets/3d/glass-rocket.png").convert("RGBA")
shield_3d = Image.open("public/assets/3d/glass-shield.png").convert("RGBA")

# Pre-render Dark Luxury Background
bg_dark = Image.new("RGBA", (W, H), (10, 6, 26, 255))
bg_draw = ImageDraw.Draw(bg_dark)
for y in range(H):
    r = int(10 + (24 - 10) * (y / H))
    g = int(6 + (14 - 6) * (y / H))
    b = int(26 + (50 - 26) * (y / H))
    bg_draw.line([(0, y), (W, y)], fill=(r, g, b, 255))

# Subtle grid dots
for gx in range(60, W, 80):
    for gy in range(60, H, 80):
        bg_draw.ellipse((gx, gy, gx+2, gy+2), fill=(109, 63, 234, 40))

# Violet ambient glow
ambient = Image.new("RGBA", (W, H), (0, 0, 0, 0))
adraw = ImageDraw.Draw(ambient)
adraw.ellipse((W//2 - 600, -150, W//2 + 600, 550), fill=(109, 63, 234, 45))
adraw.ellipse((W - 500, H - 400, W + 200, H + 200), fill=(140, 90, 255, 35))
ambient = ambient.filter(ImageFilter.GaussianBlur(110))
bg_dark.alpha_composite(ambient)

def draw_top_nav(im, draw, progress, brand_sub="Autonomous AI Procurement Network · Mezo Chain 31611"):
    lg = logo_img.resize((52, 52), Image.Resampling.LANCZOS)
    im.paste(lg, (100, 50), lg)
    draw.text((168, 54), "ProMeo", fill=(255, 255, 255), font=get_font(28, bold=True))
    draw.text((168, 88), brand_sub, fill=(180, 170, 215), font=get_font(15, bold=False))
    
    pw = int(W * progress)
    draw.line([(0, 2), (pw, 2)], fill=(139, 92, 246), width=4)

def draw_cursor(draw, x, y, clicked=False):
    pts = [(x, y), (x, y+24), (x+6, y+18), (x+12, y+27), (x+16, y+25), (x+10, y+16), (x+18, y+16)]
    fill_col = (255, 255, 255) if not clicked else (109, 63, 234)
    draw.polygon(pts, fill=fill_col, outline=(36, 27, 69))
    if clicked:
        draw.ellipse((x - 14, y - 14, x + 14, y + 14), outline=(109, 63, 234), width=3)

# ----------------- SCENE 1: KINETIC TEASER (THE PROBLEM) -----------------
def render_s1(t):
    im = bg_dark.copy()
    draw = ImageDraw.Draw(im)
    draw_top_nav(im, draw, t / TOTAL_DURATION)
    
    # Pill badge
    draw.rounded_rectangle((100, 160, 480, 200), radius=99, fill=(35, 20, 65, 220), outline=(109, 63, 234, 180), width=1)
    draw.ellipse((120, 176, 128, 184), fill=(168, 85, 247))
    draw.text((140, 171), "THE ENTERPRISE AI DILEMMA", fill=(210, 190, 255), font=font_badge)
    
    draw.text((100, 220), "The $85 Billion AI Procurement Barrier", fill=(255, 255, 255), font=font_hero)
    draw.text((100, 295), "Autonomous agent fleets are blocked by legacy purchasing workflows & counterparty risk", fill=(190, 180, 220), font=font_sub)
    
    cards = [
        ("Manual Purchase Orders", "Human sign-offs take 3 to 6 weeks, stalling real-time autonomous AI agents."),
        ("Zero Agent Bank Accounts", "AI agents cannot open corporate banking rails, risking unmonitored credit leaks."),
        ("High Counterparty Risk", "Unverified service delivery leads to payment disputes without cryptographic escrow.")
    ]
    
    cy_start = 380
    for i, (title, desc) in enumerate(cards):
        cy = cy_start + i * 135
        draw.rounded_rectangle((100, cy, 1080, cy + 110), radius=18, fill=(24, 16, 50, 220), outline=(84, 58, 170, 130), width=1)
        draw.ellipse((130, cy + 28, 146, cy + 44), fill=(109, 63, 234))
        draw.text((170, cy + 22), title, fill=(255, 255, 255), font=font_card_t)
        draw.text((170, cy + 58), desc, fill=(185, 175, 210), font=font_card_d)
        
    float_y = int(math.sin(t * 2.8) * 14)
    lk = lock_3d.resize((480, 480), Image.Resampling.LANCZOS)
    im.paste(lk, (1260, 260 + float_y), lk)
    
    draw.rounded_rectangle((1310, 780, 1710, 860), radius=20, fill=(35, 22, 70, 230), outline=(139, 92, 246, 180), width=1)
    draw.text((1340, 795), "3-6 Weeks → < 2 Seconds", fill=(255, 255, 255), font=get_font(21, bold=True))
    draw.text((1340, 826), "Autonomous Sourcing Acceleration", fill=(190, 180, 225), font=get_font(14, bold=False))
    
    return im

# ----------------- SCENE 2: THE REVOLUTIONARY SOLUTION -----------------
def render_s2(t):
    im = bg_dark.copy()
    draw = ImageDraw.Draw(im)
    draw_top_nav(im, draw, (D1 + t) / TOTAL_DURATION)
    
    draw.rounded_rectangle((100, 160, 470, 200), radius=99, fill=(35, 20, 65, 220), outline=(109, 63, 234, 180), width=1)
    draw.ellipse((120, 176, 128, 184), fill=(168, 85, 247))
    draw.text((140, 171), "THE DECENTRALIZED SOLUTION", fill=(210, 190, 255), font=font_badge)
    
    draw.text((100, 220), "Meet ProMeo: Autonomous Agent Procurement", fill=(255, 255, 255), font=font_hero)
    draw.text((100, 295), "Built natively on Mezo Blockchain · Powered by Bitcoin & Programmatic MUSD Escrow", fill=(190, 180, 220), font=font_sub)
    
    pillars = [
        ("Programmatic MUSD Escrow", "Smart contract positions (0x88ED...B048) lock funds until delivery SLA is verified."),
        ("Skip BTC/USD Oracle Integration", "Dynamic real-time Bitcoin pricing ($68,450/BTC) powers fair machine compute valuation."),
        ("veBTC Governance Amplification", "Holders of veBTC unlock +20% spend capacity boost and priority supplier routing.")
    ]
    
    cy_start = 380
    for i, (title, desc) in enumerate(pillars):
        cy = cy_start + i * 135
        draw.rounded_rectangle((100, cy, 1080, cy + 110), radius=18, fill=(24, 16, 50, 220), outline=(84, 58, 170, 130), width=1)
        draw.ellipse((130, cy + 28, 146, cy + 44), fill=(109, 63, 234))
        draw.text((170, cy + 22), title, fill=(255, 255, 255), font=font_card_t)
        draw.text((170, cy + 58), desc, fill=(185, 175, 210), font=font_card_d)
        
    float_y = int(math.sin(t * 2.8) * 12)
    rk = rocket_3d.resize((430, 520), Image.Resampling.LANCZOS)
    im.paste(rk, (1320, 230 + float_y), rk)
    
    return im

# ----------------- SCENE 3: VALUE ADDED & CERTAINTY -----------------
def render_s3(t):
    im = bg_dark.copy()
    draw = ImageDraw.Draw(im)
    draw_top_nav(im, draw, (D1 + D2 + t) / TOTAL_DURATION)
    
    draw.rounded_rectangle((100, 160, 470, 200), radius=99, fill=(35, 20, 65, 220), outline=(109, 63, 234, 180), width=1)
    draw.ellipse((120, 176, 128, 184), fill=(168, 85, 247))
    draw.text((140, 171), "ENTERPRISE CERTAINTY & PROOF", fill=(210, 190, 255), font=font_badge)
    
    draw.text((100, 220), "Zero Counterparty Risk · Mathematical SLA Settlement", fill=(255, 255, 255), font=font_hero)
    draw.text((100, 295), "Cryptographic guarantees replace blind trust across every automated compute transaction", fill=(190, 180, 220), font=font_sub)
    
    v_cards = [
        ("100% Non-Custodial Smart Contracts", "Funds release only upon verified delivery attestations, guaranteeing refund safety."),
        ("Sub-Second Settlement Velocity", "AI agents discover, negotiate, and settle cloud GPU clusters in machine time."),
        ("Tamper-Evident SHA-256 Merkle Ledger", "Every quote, policy check, and release is permanently chained into mathematical audit proofs.")
    ]
    
    cy_start = 380
    for i, (title, desc) in enumerate(v_cards):
        cy = cy_start + i * 135
        draw.rounded_rectangle((100, cy, 1080, cy + 110), radius=18, fill=(24, 16, 50, 220), outline=(84, 58, 170, 130), width=1)
        draw.ellipse((130, cy + 28, 146, cy + 44), fill=(109, 63, 234))
        draw.text((170, cy + 22), title, fill=(255, 255, 255), font=font_card_t)
        draw.text((170, cy + 58), desc, fill=(185, 175, 210), font=font_card_d)
        
    float_y = int(math.sin(t * 2.8) * 12)
    sh = shield_3d.resize((450, 490), Image.Resampling.LANCZOS)
    im.paste(sh, (1300, 250 + float_y), sh)
    
    return im

# ----------------- SCENE 4: FULL-SCREEN LIVE UI DEMO (NO MACBOOK) -----------------
def render_s4(t):
    im = Image.new("RGB", (W, H), (243, 240, 252))
    draw = ImageDraw.Draw(im)
    
    # 4A: 0.0s - 5.8s -> Overview dashboard (cards & charts)
    # 4B: 5.8s - 11.6s -> Requests & Sourcing feed (GPU cluster award)
    # 4C: 11.6s - 17.32s -> Escrow smart contract & milestone release (+25%)
    
    if t < 5.8:
        current_tab = "overview"
        p = t / 5.8
        cx = int(320 + p * 200)
        cy = int(240 + math.sin(p * math.pi) * 60)
        clicked = (p > 0.75 and p < 0.95)
    elif t < 11.6:
        current_tab = "requests"
        p = (t - 5.8) / 5.8
        cx = int(450 + p * 800)
        cy = int(420 + math.sin(p * math.pi) * 80)
        clicked = (p > 0.8)
    else:
        current_tab = "escrow"
        p = (t - 11.6) / 5.72
        cx = int(200 + p * 120)
        cy = int(690 + math.sin(p * math.pi) * 20)
        clicked = (p > 0.5)

    # 1. Left Rail (80px)
    draw.rectangle((0, 0, 80, H), fill=(255, 255, 255))
    draw.line([(80, 0), (80, H)], fill=(225, 220, 245), width=1)
    
    lg = logo_img.resize((44, 44), Image.Resampling.LANCZOS)
    im.paste(lg, (18, 20), lg)
    
    for i in range(8):
        by = 90 + i * 54
        is_active = (current_tab == "overview" and i == 0) or (current_tab == "requests" and i == 1) or (current_tab == "escrow" and i == 3)
        if is_active:
            draw.rounded_rectangle((18, by, 62, by + 44), radius=13, fill=(109, 63, 234))
            draw.ellipse((36, by + 18, 44, by + 26), fill=(255, 255, 255))
        else:
            draw.ellipse((37, by + 19, 43, by + 25), fill=(125, 118, 160))
            
    # 2. Top Appbar
    draw.rectangle((80, 0, W, 75), fill=(255, 255, 255))
    draw.line([(80, 75), (W, 75)], fill=(225, 220, 245), width=1)
    
    title_text = "Overview" if current_tab == "overview" else "Sourcing & Discovery" if current_tab == "requests" else "Escrow Agreements"
    t_font = get_font(28, bold=True)
    draw.text((115, 24), title_text, fill=(36, 27, 69), font=t_font)
    t_w = int(draw.textlength(title_text, font=t_font))
    draw.text((115 + t_w + 20, 31), "ProMeo Protocol · Mezo Chain 31611", fill=(125, 118, 160), font=get_font(15, bold=False))
    
    # Appbar pills
    draw.rounded_rectangle((W - 710, 18, W - 470, 56), radius=99, fill=(245, 243, 252), outline=(210, 200, 240))
    draw.ellipse((W - 695, 33, W - 687, 41), fill=(36, 27, 69))
    draw.text((W - 676, 27), "Mezo Oracle: $68,450/BTC", fill=(36, 27, 69), font=get_font(14, bold=True))
    
    draw.rounded_rectangle((W - 455, 18, W - 260, 56), radius=99, fill=(245, 243, 252), outline=(210, 200, 240))
    draw.text((W - 438, 27), "veBTC: 5.2 BTC Locked", fill=(36, 27, 69), font=get_font(14, bold=True))
    
    draw.rounded_rectangle((W - 245, 18, W - 90, 56), radius=99, fill=(245, 243, 252), outline=(210, 200, 240))
    draw.text((W - 225, 27), "0x88ED...B048", fill=(36, 27, 69), font=get_font(14, bold=True))
    
    # 3. Main Dashboard Body
    if current_tab == "overview":
        card_w = (W - 80 - 80) // 3
        card_h = 190
        
        cards_data = [
            ("Escrow locked on Mezo", "$1,500", "1 active agreements", lock_3d),
            ("Audit chain integrity", "100%", "142 verified events", pie_3d),
            ("MUSD settled to vendors", "650 MUSD", "Finalized on Mezo", rocket_3d)
        ]
        
        for i, (label, val, chip, asset_img) in enumerate(cards_data):
            cx_card = 115 + i * (card_w + 20)
            cy_card = 105
            draw.rounded_rectangle((cx_card, cy_card, cx_card + card_w, cy_card + card_h), radius=22, fill=(150, 110, 240), outline=(255, 255, 255, 180), width=1)
            draw.text((cx_card + 24, cy_card + 24), label, fill=(255, 255, 255), font=get_font(15, bold=False))
            draw.text((cx_card + 24, cy_card + 54), val, fill=(255, 255, 255), font=get_font(36, bold=True))
            
            draw.rounded_rectangle((cx_card + 24, cy_card + 135, cx_card + 245, cy_card + 168), radius=99, fill=(185, 150, 250), outline=(255, 255, 255), width=1)
            draw.ellipse((cx_card + 36, cy_card + 148, cx_card + 42, cy_card + 154), fill=(255, 255, 255))
            draw.text((cx_card + 50, cy_card + 142), chip, fill=(255, 255, 255), font=get_font(13, bold=True))
            
            scaled_a = asset_img.resize((145, 145), Image.Resampling.LANCZOS)
            im.paste(scaled_a, (cx_card + card_w - 155, cy_card + 22), scaled_a)
            
        chart_w = int((W - 80 - 60) * 0.65)
        panel_w = (W - 80 - 60) - chart_w - 20
        my = 320
        mh = 700
        
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

    elif current_tab == "requests":
        draw.rounded_rectangle((115, 105, W - 40, 260), radius=22, fill=(150, 110, 240))
        draw.text((150, 140), "Sourcing & Discovery Catalog", fill=(255, 255, 255), font=get_font(34, bold=True))
        draw.text((150, 195), "Deploy autonomous AI agents to broadcast compute specs, gather signed quotes, and lock escrow.", fill=(255, 255, 255), font=font_sub)
        
        rk_s = rocket_3d.resize((130, 130), Image.Resampling.LANCZOS)
        im.paste(rk_s, (W - 200, 115), rk_s)
        
        draw.rounded_rectangle((115, 290, W - 40, 1000), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
        draw.text((150, 320), "Active Procurement Broadcasts", fill=(36, 27, 69), font=get_font(21, bold=True))
        
        reqs = [
            ("REQ-9041", "Dedicated GPU Training Cluster (8x H100 SXM5)", "Cloud Infrastructure", "480 MUSD", "Awarded (Helios)"),
            ("REQ-8820", "High-Throughput Vector DB Node (128GB RAM)", "Data & Storage", "220 MUSD", "Active Sourcing"),
            ("REQ-7104", "Autonomous Security Audit & Merkle Proof", "Security & Compliance", "350 MUSD", "Under Review"),
            ("REQ-6512", "Llama-3 70B Fine-Tuning Multi-Node Cluster", "Cloud Infrastructure", "620 MUSD", "Awarded (Lambda)")
        ]
        
        for k, (ref, title, cat, budget, status) in enumerate(reqs):
            ry = 380 + k * 120
            draw.line([(140, ry - 15), (W - 60, ry - 15)], fill=(235, 230, 250), width=1)
            draw.text((150, ry), ref, fill=(125, 118, 160), font=get_font(15, bold=False))
            draw.text((280, ry), title, fill=(36, 27, 69), font=get_font(20, bold=True))
            draw.text((1050, ry), cat, fill=(125, 118, 160), font=get_font(15, bold=False))
            draw.text((1350, ry), budget, fill=(36, 27, 69), font=get_font(20, bold=True))
            draw.rounded_rectangle((1580, ry - 6, 1840, ry + 30), radius=99, fill=(243, 238, 255), outline=(109, 63, 234), width=1)
            tw = int(draw.textlength(status, font=get_font(15, bold=True)))
            tx = 1580 + (260 - tw) // 2
            draw.text((tx, ry + 2), status, fill=(109, 63, 234), font=get_font(15, bold=True))

    elif current_tab == "escrow":
        draw.rounded_rectangle((115, 105, W - 40, 260), radius=22, fill=(150, 110, 240))
        draw.text((150, 140), "Smart Contract Escrow on Mezo Chain 31611", fill=(255, 255, 255), font=get_font(34, bold=True))
        draw.text((150, 195), "Non-custodial MUSD lockup with automated milestone releases upon SLA verification.", fill=(255, 255, 255), font=font_sub)
        
        lk_s = lock_3d.resize((130, 130), Image.Resampling.LANCZOS)
        im.paste(lk_s, (W - 200, 115), lk_s)
        
        draw.rounded_rectangle((115, 290, W - 40, 680), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
        draw.text((150, 325), "Active Smart Contract Agreement · Position #0x88ED...B048", fill=(36, 27, 69), font=get_font(21, bold=True))
        
        milestones = [
            ("Milestone 1: Cluster Setup & Environment Provisioning", "100% Completed", 1.0),
            ("Milestone 2: GPU Node Allocation & Workload Execution", "50% Completed", 0.5),
            ("Milestone 3: Model Weights Verification & Final SLA Signoff", "Pending Release", 0.0)
        ]
        
        for m, (m_title, m_pct, m_val) in enumerate(milestones):
            my = 385 + m * 90
            draw.text((150, my), m_title, fill=(36, 27, 69), font=get_font(16, bold=False))
            draw.text((W - 260, my), m_pct, fill=(109, 63, 234), font=get_font(15, bold=True))
            bar_w = W - 400
            draw.rounded_rectangle((150, my + 28, 150 + bar_w, my + 40), radius=6, fill=(235, 230, 250))
            if m_val > 0:
                draw.rounded_rectangle((150, my + 28, 150 + int(bar_w * m_val), my + 40), radius=6, fill=(109, 63, 234))
                
        btn_x, btn_y = 150, 680
        draw.rounded_rectangle((btn_x, btn_y, btn_x + 360, btn_y + 55), radius=14, fill=(109, 63, 234))
        draw.text((btn_x + 38, btn_y + 16), "Release Next 25% Milestone", fill=(255, 255, 255), font=get_font(18, bold=True))
        
        if clicked:
            tx_x, tx_y = W - 620, 780
            draw.rounded_rectangle((tx_x, tx_y, tx_x + 560, tx_y + 90), radius=18, fill=(36, 27, 69), outline=(139, 92, 246), width=2)
            draw.ellipse((tx_x + 24, tx_y + 32, tx_x + 46, tx_y + 54), fill=(139, 92, 246))
            draw.text((tx_x + 60, tx_y + 22), "Milestone Released on Mezo Chain 31611!", fill=(255, 255, 255), font=get_font(18, bold=True))
            draw.text((tx_x + 60, tx_y + 52), "Tx: 0x7c9a81f3...3f12 · MUSD Escrow Settled", fill=(210, 200, 245), font=get_font(15, bold=False))

    draw_cursor(draw, cx, cy, clicked)
    return im

# ----------------- SCENE 5: HIGH-IMPACT OUTRO & CALL TO ACTION -----------------
def render_s5(t):
    im = bg_dark.copy()
    draw = ImageDraw.Draw(im)
    draw_top_nav(im, draw, 1.0)
    
    lg_big = logo_img.resize((140, 140), Image.Resampling.LANCZOS)
    im.paste(lg_big, (W//2 - 70, 230), lg_big)
    
    draw.text((W//2 - 390, 410), "Power Your Autonomous AI Fleet", fill=(255, 255, 255), font=font_hero)
    draw.text((W//2 - 320, 490), "Built on Mezo · Powered by Bitcoin & MUSD", fill=(190, 180, 225), font=font_sub)
    
    badges = [
        ("Mezo Chain 31611", "Testnet Settlement Live"),
        ("Non-Custodial Escrow", "Programmatic MUSD Safety"),
        ("Skip BTC Oracle", "$68,450/BTC Dynamic Feed")
    ]
    
    bx = W//2 - 450
    for i, (b1, b2) in enumerate(badges):
        x = bx + i * 310
        draw.rounded_rectangle((x, 570, x + 280, 665), radius=16, fill=(30, 20, 60, 220), outline=(109, 63, 234, 160), width=1)
        draw.text((x + 22, 592), b1, fill=(255, 255, 255), font=get_font(19, bold=True))
        draw.text((x + 22, 626), b2, fill=(180, 170, 210), font=get_font(14, bold=False))
        
    draw.text((W//2 - 180, 735), "https://promeo.network", fill=(168, 85, 247), font=get_font(26, bold=True))
    
    return im

print("Starting Creative Promo render loop...")

for i in range(TOTAL_FRAMES):
    t_global = i / FPS
    
    if t_global < D1:
        frame = render_s1(t_global)
    elif t_global < D1 + D2:
        frame = render_s2(t_global - D1)
    elif t_global < D1 + D2 + D3:
        frame = render_s3(t_global - (D1 + D2))
    elif t_global < D1 + D2 + D3 + D4:
        frame = render_s4(t_global - (D1 + D2 + D3))
    else:
        frame = render_s5(t_global - (D1 + D2 + D3 + D4))
        
    out_file = os.path.join(FRAMES_DIR, f"frame_{i:05d}.jpg")
    frame.convert("RGB").save(out_file, quality=92)
    
    if i % 100 == 0:
        print(f"Rendered {i}/{TOTAL_FRAMES} frames ({i*100//TOTAL_FRAMES}%)")

print("All frames rendered successfully! Running FFmpeg...")

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
    print(f"High-production SaaS Promo Video encoded successfully at {OUTPUT_VIDEO}!")
else:
    print("FFmpeg error:", res.stderr[-500:])
