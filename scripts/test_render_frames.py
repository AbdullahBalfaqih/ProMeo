from PIL import Image, ImageDraw, ImageFont, ImageFilter
import os, math

W, H = 1920, 1080
font_title = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 46)
font_sub = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 22)
font_card_t = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 20)
font_card_d = ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15)

# Test creating full screen UI frame
def render_fullscreen_ui(tab="overview", cursor_pos=(400, 300), clicked=False):
    im = Image.new("RGB", (W, H), (243, 240, 252))
    draw = ImageDraw.Draw(im)
    
    # 1. Left Rail (80px)
    draw.rectangle((0, 0, 80, H), fill=(255, 255, 255))
    draw.line([(80, 0), (80, H)], fill=(220, 215, 240), width=1)
    # Logo
    logo = Image.open("public/assets/logo.png").convert("RGBA").resize((44, 44))
    im.paste(logo, (18, 22), logo)
    
    # Rail buttons
    icons = ["i-home", "i-doc", "i-check", "i-lock", "i-scale", "i-bot", "i-shop", "i-sliders"]
    for i, ic in enumerate(icons):
        by = 95 + i * 56
        is_active = (tab == "overview" and i == 0) or (tab == "requests" and i == 1) or (tab == "escrow" and i == 3)
        if is_active:
            draw.rounded_rectangle((18, by, 62, by + 44), radius=13, fill=(109, 63, 234))
            draw.ellipse((36, by + 18, 44, by + 26), fill=(255, 255, 255))
        else:
            draw.ellipse((37, by + 19, 43, by + 25), fill=(125, 118, 160))
            
    # 2. Top Appbar
    draw.rectangle((80, 0, W, 75), fill=(255, 255, 255))
    draw.line([(80, 75), (W, 75)], fill=(225, 220, 245), width=1)
    
    title_text = "Overview" if tab == "overview" else "Sourcing & Discovery" if tab == "requests" else "Escrow Agreements"
    draw.text((115, 24), title_text, fill=(36, 27, 69), font=font_title)
    
    # Appbar pills
    # Oracle
    draw.rounded_rectangle((W - 680, 18, W - 450, 56), radius=99, fill=(245, 243, 252), outline=(210, 200, 240))
    draw.ellipse((W - 665, 33, W - 657, 41), fill=(36, 27, 69))
    draw.text((W - 648, 27), "Mezo Oracle: $68,450/BTC", fill=(36, 27, 69), font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14))
    
    # veBTC
    draw.rounded_rectangle((W - 435, 18, W - 250, 56), radius=99, fill=(245, 243, 252), outline=(210, 200, 240))
    draw.text((W - 418, 27), "veBTC: 5.2 BTC Locked", fill=(36, 27, 69), font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14))
    
    # Wallet
    draw.rounded_rectangle((W - 235, 18, W - 80, 56), radius=99, fill=(245, 243, 252), outline=(210, 200, 240))
    draw.text((W - 215, 27), "0x88ED...B048", fill=(36, 27, 69), font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 14))
    
    # 3. Main Body Content
    if tab == "overview":
        # 3 Hero Stat Cards
        card_w = (W - 80 - 80) // 3
        card_h = 190
        
        cards_data = [
            ("Escrow locked on Mezo", "$1,500", "1 active agreements", "public/assets/3d/glass-lock.png"),
            ("Audit chain integrity", "100%", "142 verified events", "public/assets/3d/glass-pie.png"),
            ("MUSD settled to vendors", "650 MUSD", "Finalized on Mezo", "public/assets/3d/glass-rocket.png")
        ]
        
        for i, (label, val, chip, asset_path) in enumerate(cards_data):
            cx = 115 + i * (card_w + 20)
            cy = 105
            # Card background with purple gradient
            draw.rounded_rectangle((cx, cy, cx + card_w, cy + card_h), radius=22, fill=(150, 110, 240), outline=(255, 255, 255, 180), width=1)
            draw.text((cx + 24, cy + 24), label, fill=(255, 255, 255), font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 15))
            draw.text((cx + 24, cy + 54), val, fill=(255, 255, 255), font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36))
            
            # Bottom pill
            draw.rounded_rectangle((cx + 24, cy + 135, cx + 240, cy + 168), radius=99, fill=(255, 255, 255, 60))
            draw.ellipse((cx + 36, cy + 148, cx + 42, cy + 154), fill=(255, 255, 255))
            draw.text((cx + 52, cy + 142), chip, fill=(255, 255, 255), font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 13))
            
            # 3D Asset on right side
            if os.path.exists(asset_path):
                asset = Image.open(asset_path).convert("RGBA").resize((145, 145), Image.Resampling.LANCZOS)
                im.paste(asset, (cx + card_w - 155, cy + 22), asset)
                
        # Main section: Left Chart + Right Panel
        chart_w = int((W - 80 - 60) * 0.65)
        panel_w = (W - 80 - 60) - chart_w - 20
        my = 320
        mh = 700
        
        # Left: Chart Card
        draw.rounded_rectangle((115, my, 115 + chart_w, my + mh), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
        draw.text((145, my + 30), "Network Escrow Volume & Oracle Price", fill=(36, 27, 69), font=font_card_t)
        draw.text((145, my + 65), "$557,507 MUSD", fill=(109, 63, 234), font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 32))
        
        # Smooth area chart curve
        pts = [(145, my + 450), (280, my + 410), (420, my + 430), (560, my + 340), (700, my + 360), (840, my + 280), (980, my + 300), (1120, my + 210), (1200, my + 190)]
        for j in range(len(pts)-1):
            draw.line([pts[j], pts[j+1]], fill=(109, 63, 234), width=4)
            draw.ellipse((pts[j][0]-4, pts[j][1]-4, pts[j][0]+4, pts[j][1]+4), fill=(109, 63, 234))
            
        # Right: Quick Escrow Actions & Dial
        rx = 115 + chart_w + 20
        draw.rounded_rectangle((rx, my, rx + panel_w, my + mh), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
        draw.text((rx + 30, my + 30), "Escrow Staking & Allocation", fill=(36, 27, 69), font=font_card_t)
        
        # Gauge dial representation
        draw.arc((rx + panel_w//2 - 90, my + 90, rx + panel_w//2 + 90, my + 270), start=140, end=400, fill=(109, 63, 234), width=14)
        draw.text((rx + panel_w//2 - 40, my + 160), "74%", fill=(36, 27, 69), font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 36))
        draw.text((rx + panel_w//2 - 50, my + 205), "Allocated Pool", fill=(125, 118, 160), font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf", 14))
        
        # Lockup simulator fields
        draw.rounded_rectangle((rx + 30, my + 310, rx + panel_w - 30, my + 365), radius=14, fill=(245, 243, 252), outline=(210, 200, 240))
        draw.text((rx + 46, my + 328), "Amount: 1,500 MUSD", fill=(36, 27, 69), font=font_card_d)
        
        draw.rounded_rectangle((rx + 30, my + 390, rx + panel_w - 30, my + 445), radius=14, fill=(109, 63, 234))
        draw.text((rx + panel_w//2 - 80, my + 408), "Lock MUSD in Escrow", fill=(255, 255, 255), font=font_card_t)
        
    elif tab == "requests":
        # Sourcing Requests view
        draw.rounded_rectangle((115, 105, W - 40, 260), radius=22, fill=(150, 110, 240))
        draw.text((150, 140), "Sourcing & Discovery Catalog", fill=(255, 255, 255), font=font_title)
        draw.text((150, 195), "Deploy autonomous AI agents to broadcast compute specs, gather signed quotes, and lock escrow.", fill=(255, 255, 255), font=font_sub)
        
        rocket = Image.open("public/assets/3d/glass-rocket.png").convert("RGBA").resize((130, 130))
        im.paste(rocket, (W - 200, 115), rocket)
        
        # Table of active requests
        draw.rounded_rectangle((115, 290, W - 40, 1000), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
        draw.text((150, 320), "Active Procurement Broadcasts", fill=(36, 27, 69), font=font_card_t)
        
        # Rows
        reqs = [
            ("REQ-9041", "Dedicated GPU Training Cluster (8x H100 SXM5)", "Cloud Infrastructure", "480 MUSD", "Awarded (Helios)"),
            ("REQ-8820", "High-Throughput Vector DB Node (128GB RAM)", "Data & Storage", "220 MUSD", "Active Sourcing"),
            ("REQ-7104", "Autonomous Security Audit & Merkle Proof", "Security & Compliance", "350 MUSD", "Under Review"),
            ("REQ-6512", "Llama-3 70B Fine-Tuning Multi-Node Cluster", "Cloud Infrastructure", "620 MUSD", "Awarded (Lambda)")
        ]
        
        for k, (ref, title, cat, budget, status) in enumerate(reqs):
            ry = 380 + k * 120
            draw.line([(140, ry - 15), (W - 60, ry - 15)], fill=(235, 230, 250), width=1)
            draw.text((150, ry), ref, fill=(125, 118, 160), font=font_card_d)
            draw.text((280, ry), title, fill=(36, 27, 69), font=font_card_t)
            draw.text((1050, ry), cat, fill=(125, 118, 160), font=font_card_d)
            draw.text((1350, ry), budget, fill=(36, 27, 69), font=font_card_t)
            draw.rounded_rectangle((1600, ry - 6, 1780, ry + 28), radius=99, fill=(109, 63, 234, 30), outline=(109, 63, 234, 120))
            draw.text((1620, ry), status, fill=(109, 63, 234), font=font_card_d)

    elif tab == "escrow":
        # Escrow Agreements & Milestone Release
        draw.rounded_rectangle((115, 105, W - 40, 260), radius=22, fill=(150, 110, 240))
        draw.text((150, 140), "Smart Contract Escrow on Mezo Chain 31611", fill=(255, 255, 255), font=font_title)
        draw.text((150, 195), "Non-custodial MUSD lockup with automated milestone releases upon SLA verification.", fill=(255, 255, 255), font=font_sub)
        
        lock = Image.open("public/assets/3d/glass-lock.png").convert("RGBA").resize((130, 130))
        im.paste(lock, (W - 200, 115), lock)
        
        # Milestone progress card
        draw.rounded_rectangle((115, 290, W - 40, 680), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
        draw.text((150, 325), "Active Smart Contract Agreement · Position #0x88ED...B048", fill=(36, 27, 69), font=font_card_t)
        
        # 3 Milestones
        milestones = [
            ("Milestone 1: Cluster Setup & Environment Provisioning", "100% Completed", 1.0),
            ("Milestone 2: GPU Node Allocation & Workload Execution", "50% Completed", 0.5),
            ("Milestone 3: Model Weights Verification & Final SLA Signoff", "Pending Release", 0.0)
        ]
        
        for m, (m_title, m_pct, m_val) in enumerate(milestones):
            my = 385 + m * 90
            draw.text((150, my), m_title, fill=(36, 27, 69), font=font_card_d)
            draw.text((W - 260, my), m_pct, fill=(109, 63, 234), font=ImageFont.truetype("/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf", 15))
            # Progress bar
            bar_w = W - 200
            draw.rounded_rectangle((150, my + 28, 150 + bar_w, my + 40), radius=6, fill=(235, 230, 250))
            if m_val > 0:
                draw.rounded_rectangle((150, my + 28, 150 + int(bar_w * m_val), my + 40), radius=6, fill=(109, 63, 234))
                
        # Milestone release action button
        btn_x, btn_y = 150, 680
        draw.rounded_rectangle((btn_x, btn_y, btn_x + 320, btn_y + 55), radius=14, fill=(109, 63, 234))
        draw.text((btn_x + 36, btn_y + 16), "⚡ Release Next 25% Milestone", fill=(255, 255, 255), font=font_card_t)
        
        if clicked:
            # On-chain confirmation toast popup!
            tx_x, tx_y = W - 620, 780
            draw.rounded_rectangle((tx_x, tx_y, tx_x + 560, tx_y + 90), radius=18, fill=(36, 27, 69), outline=(139, 92, 246), width=2)
            draw.ellipse((tx_x + 24, tx_y + 32, tx_x + 46, tx_y + 54), fill=(139, 92, 246))
            draw.text((tx_x + 60, tx_y + 22), "Milestone Released on Mezo Chain 31611!", fill=(255, 255, 255), font=font_card_t)
            draw.text((tx_x + 60, tx_y + 52), "Tx: 0x7c9a81f3...3f12 · MUSD Escrow Settled", fill=(210, 200, 245), font=font_card_d)

    # 4. Draw Cursor
    cx, cy = cursor_pos
    draw_cursor(draw, cx, cy, clicked)
    
    return im

def draw_cursor(draw, x, y, clicked=False):
    pts = [(x, y), (x, y+24), (x+6, y+18), (x+12, y+27), (x+16, y+25), (x+10, y+16), (x+18, y+16)]
    fill_col = (255, 255, 255) if not clicked else (109, 63, 234)
    draw.polygon(pts, fill=fill_col, outline=(36, 27, 69))
    if clicked:
        draw.ellipse((x - 12, y - 12, x + 12, y + 12), outline=(109, 63, 234), width=3)

# Test render
im_test = render_fullscreen_ui("escrow", (260, 700), True)
im_test.save("/tmp/test_fullscreen_ui.jpg")
print("Saved /tmp/test_fullscreen_ui.jpg successfully!")
