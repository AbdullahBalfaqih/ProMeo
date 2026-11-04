import os, math
from PIL import Image, ImageDraw, ImageFont, ImageFilter

W, H = 1920, 1080
FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
FONT_REG = "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"

def get_font(size, bold=False):
    return ImageFont.truetype(FONT_BOLD if bold else FONT_REG, size)

logo_img = Image.open("public/assets/logo.png").convert("RGBA")
shield_3d = Image.open("public/assets/3d/glass-shield.png").convert("RGBA")

def draw_topbar(im, draw, active_tab_name):
    # Left Rail
    draw.rectangle((0, 0, 80, H), fill=(255, 255, 255))
    draw.line([(80, 0), (80, H)], fill=(225, 220, 245), width=1)
    im.paste(logo_img.resize((44, 44), Image.Resampling.LANCZOS), (18, 20), logo_img.resize((44, 44)))
    
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

# 1. SCREEN POLICIES
im_pol = Image.new("RGB", (W, H), (243, 240, 252))
d_pol = ImageDraw.Draw(im_pol)
draw_topbar(im_pol, d_pol, "Agent Governance & Policy Engine")

# Hero Banner
d_pol.rounded_rectangle((115, 105, W - 40, 250), radius=22, fill=(150, 110, 240))
d_pol.text((150, 138), "Deterministic Agent Spend Limits on Mezo", fill=(255, 255, 255), font=get_font(32, bold=True))
d_pol.text((150, 188), "Cryptographically anchored to AgentPolicyRegistry.sol (0x957d...8ccC) · Zero runaway spend.", fill=(245, 240, 255), font=get_font(18, bold=False))

# Agent Card Left
d_pol.rounded_rectangle((115, 280, 950, 980), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
d_pol.text((150, 315), "Autonomous Agent: procurement-bot", fill=(36, 27, 69), font=get_font(24, bold=True))
d_pol.text((150, 355), "Wallet: 0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a", fill=(125, 118, 160), font=get_font(14, bold=False))

rules = [
    ("Daily Spend Ceiling", "5,000 MUSD / day", "Enforced by Mezo contract"),
    ("Max Per-Request Budget", "3,000 MUSD / transaction", "Hard cap per RFQ"),
    ("Skip Oracle Pegging", "Max 0.05 BTC eq.", "Indexed dynamically"),
    ("veBTC Policy Boost", "+20% Spend Amplification", "Active tier 2 staking"),
    ("Policy Merkle Hash", "0x3a7f8b91c410e52a90d81f12", "Verified on-chain")
]

for i, (rt, rv, rd) in enumerate(rules):
    y = 410 + i * 105
    d_pol.line([(150, y), (915, y)], fill=(240, 235, 252), width=1)
    d_pol.text((150, y + 15), rt, fill=(125, 118, 160), font=get_font(15, bold=False))
    d_pol.text((150, y + 42), rv, fill=(36, 27, 69), font=get_font(21, bold=True))
    d_pol.text((620, y + 42), rd, fill=(109, 63, 234), font=get_font(14, bold=True))

# Right Column - Policy Merkle Proof
d_pol.rounded_rectangle((980, 280, W - 40, 980), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
d_pol.text((1015, 315), "Cryptographic Policy Attestation", fill=(36, 27, 69), font=get_font(24, bold=True))
d_pol.text((1015, 355), "Smart contract verification log on Mezo Chain 31611", fill=(125, 118, 160), font=get_font(14, bold=False))

steps = [
    ("1. Merkle Tree Root Generated", "SHA-256 tree of org policies, budgets & allowed capabilities"),
    ("2. Stored on Mezo Registry", "Registered in AgentPolicyRegistry.sol at block #16364920"),
    ("3. Autonomous Authorization", "Agent signs transactions with ephemeral key scoped to Merkle root"),
    ("4. Dynamic veBTC Multiplier", "Holders of veBTC token unlock 1.20x spend amplification")
]
for k, (st, sd) in enumerate(steps):
    sy = 420 + k * 125
    d_pol.rounded_rectangle((1015, sy, W - 75, sy + 100), radius=16, fill=(248, 245, 254), outline=(220, 210, 245))
    d_pol.text((1040, sy + 22), st, fill=(36, 27, 69), font=get_font(18, bold=True))
    d_pol.text((1040, sy + 56), sd, fill=(125, 118, 160), font=get_font(14, bold=False))

im_pol.save("/tmp/test_screen_policies.jpg", quality=92)
print("Saved /tmp/test_screen_policies.jpg")

# 2. SCREEN AUDIT
im_aud = Image.new("RGB", (W, H), (243, 240, 252))
d_aud = ImageDraw.Draw(im_aud)
draw_topbar(im_aud, d_aud, "Audit & Dispute Trail (Merkle Chain)")

d_aud.rounded_rectangle((115, 105, W - 40, 250), radius=22, fill=(150, 110, 240))
d_aud.text((150, 138), "Tamper-Evident SHA-256 Cryptographic Audit Trail", fill=(255, 255, 255), font=get_font(32, bold=True))
d_aud.text((150, 188), "Every procurement step is immutably chained into mathematical proofs on Mezo Chain 31611.", fill=(245, 240, 255), font=get_font(18, bold=False))

d_aud.rounded_rectangle((115, 280, W - 40, 980), radius=22, fill=(255, 255, 255), outline=(225, 220, 245), width=1)
d_aud.text((150, 315), "Sequential State Transitions & Hashes", fill=(36, 27, 69), font=get_font(24, bold=True))

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
    d_aud.line([(150, ay - 10), (W - 60, ay - 10)], fill=(235, 230, 250), width=1)
    d_aud.text((150, ay + 12), b_num, fill=(125, 118, 160), font=get_font(14, bold=False))
    d_aud.text((310, ay + 10), b_action, fill=(36, 27, 69), font=get_font(18, bold=True))
    d_aud.text((820, ay + 12), b_detail, fill=(125, 118, 160), font=get_font(15, bold=False))
    d_aud.text((1180, ay + 12), b_hash, fill=(109, 63, 234), font=get_font(14, bold=True))
    d_aud.rounded_rectangle((1620, ay + 6, 1780, ay + 42), radius=99, fill=(240, 235, 255), outline=(109, 63, 234))
    d_aud.text((1645, ay + 12), b_status, fill=(109, 63, 234), font=get_font(14, bold=True))

im_aud.save("/tmp/test_screen_audit.jpg", quality=92)
print("Saved /tmp/test_screen_audit.jpg")
