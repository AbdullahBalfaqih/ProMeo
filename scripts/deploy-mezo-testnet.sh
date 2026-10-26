#!/usr/bin/env bash
# ============================================================================
# نشر نظام المشتريات على Mezo Testnet الحقيقية — بأمر واحد
#
#   bash scripts/deploy-mezo-testnet.sh
#
# التشغيل الأول: ينشئ 5 محافظ آمنة في keys.env ويطلب منك تمويل عنوانين.
# التشغيل الثاني (بعد التمويل): ينشر العقود، يمنح دور المحكّم، ويكتب
#                                server/.env.mezo-testnet جاهزاً للتشغيل.
# ============================================================================
set -euo pipefail

RPC="https://rpc.test.mezo.org"
CHAIN_ID="31611"
MUSD="0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503"
FAUCET="https://faucet.test.mezo.org"
BORROW="https://testnet.mezo.org"
EXPLORER="https://explorer.test.mezo.org"

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KEYS="$ROOT/keys.env"
ENVOUT="$ROOT/server/.env.mezo-testnet"
DEP_FILE="$ROOT/contracts/deployments/mezo-testnet-$CHAIN_ID.json"

say()  { printf "\n\033[1;35m== %s\033[0m\n" "$*"; }
good() { printf "\033[1;32m✓\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m!\033[0m %s\n" "$*"; }
die()  { printf "\033[1;31m✗ %s\033[0m\n" "$*"; exit 1; }

command -v cast >/dev/null 2>&1 || {
  for CAND in "$HOME/.foundry/bin" "/tmp/foundry/bin" "/usr/local/bin"; do
    [ -x "$CAND/cast" ] && export PATH="$CAND:$PATH" && break
  done
}
command -v cast >/dev/null 2>&1 || die "cast غير موجود — ثبّت foundry أولاً: curl -L https://foundry.paradigm.xyz | bash && foundryup"

say "فحص الشبكة"
GOT=$(cast chain-id --rpc-url "$RPC")
[ "$GOT" = "$CHAIN_ID" ] || die "معرّف السلسلة $GOT وليس $CHAIN_ID — أوقف كل شيء"
good "Mezo Testnet يستجيب (chain $GOT)"
SYM=$(cast call "$MUSD" "symbol()(string)" --rpc-url "$RPC")
DEC=$(cast call "$MUSD" "decimals()(uint8)" --rpc-url "$RPC")
SYM="${SYM//\"/}"; DEC="${DEC//\"/}"
[ "$SYM" = "MUSD" ] && [ "$DEC" = "18" ] || die "العنوان $MUSD ليس Musd الرسمي (رجع $SYM/$DEC)"
good "عنوان Musd الرسمي صحيح (MUSD، 18 خانة)"

say "المحافظ"
if [ ! -f "$KEYS" ]; then
  if command -v python3 >/dev/null 2>&1 && python3 -c "import sys" 2>/dev/null; then
    python3 - <<'PY' > "$KEYS"
import json, subprocess
for n in ["DEPLOYER", "RESOLVER", "BUYER", "VENDOR"]:
    w = json.loads(subprocess.check_output(["cast", "wallet", "new", "--json"]))["data"][0]
    print(f"{n}_ADDRESS={w['address']}")
    print(f"{n}_KEY={w['private_key']}")
w = json.loads(subprocess.check_output(["cast", "wallet", "new", "--json"]))["data"][0]
print(f"TREASURY_ADDRESS={w['address']}")
PY
  else
    node - <<'JS' > "$KEYS"
const cp = require("child_process");
for (const n of ["DEPLOYER", "RESOLVER", "BUYER", "VENDOR"]) {
  const w = JSON.parse(cp.execSync("cast wallet new --json").toString()).data[0];
  console.log(`${n}_ADDRESS=${w.address}`);
  console.log(`${n}_KEY=${w.private_key}`);
}
const w = JSON.parse(cp.execSync("cast wallet new --json").toString()).data[0];
console.log(`TREASURY_ADDRESS=${w.address}`);
JS
  fi
  chmod 600 "$KEYS" 2>/dev/null || true
  good "أُنشئت 5 محافظ جديدة في $KEYS"
else
  good "استخدم المحافظ الموجودة في $KEYS"
fi
# shellcheck disable=SC1090
source "$KEYS"

echo "  DEPLOYER (الناشر + منفّذ المشتري) : $DEPLOYER_ADDRESS"
echo "  RESOLVER (محكّم النزاعات)          : $RESOLVER_ADDRESS"
echo "  BUYER    (محفظة المشتري)           : $BUYER_ADDRESS"
echo "  VENDOR   (محفظة المورد)            : $VENDOR_ADDRESS"
echo "  TREASURY (خزينة رسوم البروتوكول)   : $TREASURY_ADDRESS"

say "حالة التمويل"
NEED_FUNDING=0
GAS=$(cast balance "$DEPLOYER_ADDRESS" --rpc-url "$RPC" 2>/dev/null || echo 0)
if [ "$GAS" = "0" ]; then
  NEED_FUNDING=1
  warn "خطوة 1 من 2 — غاز: افتح $FAUCET"
  warn "       والصق عنوان DEPLOYER: $DEPLOYER_ADDRESS"
  warn "       (حل الكابتشا ثم اطلب BTC التجريبي)"
else
  good "غاز DEPLOYER متوفر"
fi
MUSDBAL=$(cast call "$MUSD" "balanceOf(address)(uint256)" "$BUYER_ADDRESS" --rpc-url "$RPC" 2>/dev/null || echo 0)
if [ "$MUSDBAL" = "0" ]; then
  NEED_FUNDING=1
  warn "خطوة 2 من 2 — Musd لمحفظة المشتري: $BUYER_ADDRESS"
  warn "       1) استورد المفتاح DEPLOYER_KEY من keys.env في MetaMask"
  warn "       2) ادخل $BORROW وأودع BTC كضمان ثم Borrow Musd"
  warn "       3) حوّل Musd من DEPLOYER إلى عنوان BUYER أعلاه"
else
  good "رصيد Musd متوفر في محفظة المشتري"
fi

if [ "$NEED_FUNDING" = "1" ]; then
  echo ""
  warn "أكمل الخطوتين أعلاه ثم أعد تشغيل نفس الأمر:"
  warn "  bash scripts/deploy-mezo-testnet.sh"
  exit 0
fi

cd "$ROOT/contracts"
if [ ! -f "deployments/mezo-testnet-$CHAIN_ID.json" ]; then
  say "نشر العقود (قد يستغرق دقيقة أو أكثر)"
  PRIVATE_KEY="$DEPLOYER_KEY" \
  MUSD_ADDRESS="$MUSD" \
  REGISTRY_ADMIN="${REGISTRY_ADMIN:-$DEPLOYER_ADDRESS}" \
  ESCROW_ADMIN="${ESCROW_ADMIN:-$DEPLOYER_ADDRESS}" \
  FEE_RECIPIENT="$TREASURY_ADDRESS" \
  FEE_BPS="${FEE_BPS:-100}" \
  NETWORK=mezo-testnet \
  EXPECTED_CHAIN_ID="$CHAIN_ID" \
  forge script script/Deploy.s.sol:Deploy --rpc-url "$RPC" --broadcast --slow
else
  good "العقود منشورة بالفعل على Mezo Testnet"
fi

REGISTRY=$(node -e "const fs = require('fs'); const d = JSON.parse(fs.readFileSync('deployments/mezo-testnet-$CHAIN_ID.json')); console.log(d.agentPolicyRegistry);")
ESCROW=$(node -e "const fs = require('fs'); const d = JSON.parse(fs.readFileSync('deployments/mezo-testnet-$CHAIN_ID.json')); console.log(d.procurementEscrow);")
good "AgentPolicyRegistry : $REGISTRY"
good "ProcurementEscrow   : $ESCROW"

say "منح دور المحكّم RESOLVER_ROLE"
R_ROLE=$(cast keccak "RESOLVER_ROLE")
cast send "$ESCROW" "grantRole(bytes32,address)" "$R_ROLE" "$RESOLVER_ADDRESS" \
  --gas-limit 150000 \
  --rpc-url "$RPC" --private-key "$DEPLOYER_KEY" >/dev/null
GRANTED=$(cast call "$ESCROW" "hasRole(bytes32,address)(bool)" "$R_ROLE" "$RESOLVER_ADDRESS" --rpc-url "$RPC")
GRANTED="${GRANTED//\"/}"
[ "$GRANTED" = "true" ] || die "فشل التحقق من منح الدور"
good "RESOLVER_ROLE ممنوح ومتحقق منه على السلسلة"

say "كتابة إعدادات الخادم"
mkdir -p "$ROOT/server"
if [ -f "$ENVOUT" ]; then
  cp "$ENVOUT" "$ENVOUT.bak"
  good "نسخة احتياطية من الإعدادات السابقة: .env.mezo-testnet.bak"
fi
SEC_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
OP_TOK="op-$(node -e "console.log(require('crypto').randomBytes(16).toString('hex'))")"
cat > "$ENVOUT" <<ENV
# توليدي آلياً بواسطة scripts/deploy-mezo-testnet.sh — لا ترفعه إلى Git
NODE_ENV=production
PORT=4000
HOST=0.0.0.0
LOG_LEVEL=info
PUBLIC_BASE_URL=http://localhost:4000
CORS_ORIGINS=

DATABASE_URL=postgres://apn:CHANGE_ME@127.0.0.1:5432/apn

MEZO_CHAIN_ID=$CHAIN_ID
MEZO_RPC_URL=$RPC
MEZO_EXPLORER_URL=$EXPLORER
MUSD_ADDRESS=$MUSD
ESCROW_CONTRACT_ADDRESS=$ESCROW
REGISTRY_CONTRACT_ADDRESS=$REGISTRY

INDEXER_ENABLED=true
INDEXER_CONFIRMATIONS=3

RESOLVER_PRIVATE_KEY=$RESOLVER_KEY
BUYER_PRIVATE_KEY=$BUYER_KEY
VENDOR_PRIVATE_KEY=$VENDOR_KEY

SECRET_ENCRYPTION_KEY=$SEC_KEY
OPERATOR_TOKEN=$OP_TOK
ALLOW_BOOTSTRAP=false
WEBHOOK_WORKER_ENABLED=true
ENV
chmod 600 "$ENVOUT"
good "كُتب $ENVOUT"

say "انتهى النشر بنجاح"
echo "  تحقق من العقود على المستكشف: $EXPLORER/address/$ESCROW"
echo ""
echo "  الخطوات الأخيرة لتشغيل الخادم:"
echo "    1) cd server && cp .env.mezo-testnet .env"
echo "    2) عدّل DATABASE_URL بكلمة سر قاعدة بياناتك الحقيقية"
echo "    3) npx tsx src/db/migrate.ts"
echo "    4) npx tsx src/server.ts"
echo ""
echo "  ثم من الكونسول: أنشئ مؤسستك (محفظة الخزينة = $BUYER_ADDRESS)"
echo "  وابدأ أول دورة شراء حقيقية على Mezo."
