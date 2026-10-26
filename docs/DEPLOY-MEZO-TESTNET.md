# نشر النظام على شبكة Mezo التجريبية الحقيقية (Runbook)

هذا الدليل ينقل النظام من سلسلة التطوير المحلية (Anvil) إلى
**Mezo Testnet** الحقيقية. كل القيم أدناه تم التحقق منها مباشرة من
`rpc.test.mezo.org` ومن وثائق Mezo الرسمية.

## القيم الرسمية للشبكة (تم التحقق منها حياً)

| المعامل | القيمة |
|---|---|
| الاسم | Mezo Testnet |
| معرف السلسلة | `31611` (`0x7b7b`) — فحص حي: `eth_chainId` يرجع `0x7b7b` |
| RPC (HTTP) | `https://rpc.test.mezo.org` |
| RPC (WSS) | `wss://rpc-ws.test.mezo.org` |
| عملة الغاز | BTC (18 خانة عشرية) |
| المستكشف | `https://explorer.test.mezo.org` (Blockscout) |
| صنبور الغاز | `https://faucet.test.mezo.org` (محمي بكابتشا) |
| رمز Musd الرسمي | `0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503` (18 خانة، EIP-2612) |
| إصدار EVM الموصى به | `london` (مضبوط مسبقاً في `contracts/foundry.toml`) |

> للحصول على Musd تجريبي: أودع BTC تجريبي كضمان في `https://testnet.mezo.org`
> ثم استعرِض (Borrow) Musd مقابل الضمان.

---

## الخطوة 0 — المحافظ المطلوبة (4 محافظ + خزينة)

| المحفظة | دورها | تمويلها المطلوب |
|---|---|---|
| `DEPLOYER / ADMIN` | تنشر العقود وتمتلك أدوار المدير | غاز BTC (يكفي 0.05 BTC تجريبي) |
| `RESOLVER` | يفصل النزاعات (`RESOLVER_ROLE`) | غاز BTC بسيط |
| `BUYER EXECUTOR` | يوقّع approve/fund/release/cancel/dispute | غاز BTC + رصيد Musd |
| `VENDOR EXECUTOR` | يوقّع accept/submitDelivery | غاز BTC بسيط |
| `FEE_RECIPIENT` | خزينة رسوم البروتوكول (1%) | لا شيء |

أنشئها بأي محفظة EVM (مثال بأداة cast):

```bash
cast wallet new   # كررها لكل محفظة واحفظ المفاتيح في مدير أسرار — لا تضعها في Git
```

---

## الخطوة 1 — التحقق قبل النشر (لا تتخطَّها)

```bash
cd contracts

# 1) السلسلة الصحيحة؟ يجب أن يرجع 31611
cast chain-id --rpc-url https://rpc.test.mezo.org

# 2) الغاز متوفر في محفظة الناشر؟
cast balance <DEPLOYER_ADDRESS> --rpc-url https://rpc.test.mezo.org

# 3) عنوان Musd الرسمي سليم؟ يجب أن يرجع MUSD و 18
cast call 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503 "symbol()(string)"  --rpc-url https://rpc.test.mezo.org
cast call 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503 "decimals()(uint8)" --rpc-url https://rpc.test.mezo.org
```

---

## الخطوة 2 — نشر العقود

سكربت `script/Deploy.s.sol` ينشر `AgentPolicyRegistry` ثم `ProcurementEscrow`
ويكتب الناتج تلقائياً في `deployments/mezo-testnet.json`. الحارس
`EXPECTED_CHAIN_ID=31611` يمنع النشر الخاطئ على سلسلة أخرى.

```bash
cd contracts

export FOUNDRY_DIR=/tmp/foundry   # أو تثبيتك المحلي لـ foundry

PRIVATE_KEY=<مفتاح DEPLOYER> \
MUSD_ADDRESS=0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503 \
REGISTRY_ADMIN=<عنوان MULTISIG أو DEPLOYER> \
ESCROW_ADMIN=<عنوان مدير التشغيل> \
FEE_RECIPIENT=<عنوان خزينة الرسوم> \
FEE_BPS=100 \
NETWORK=mezo-testnet \
EXPECTED_CHAIN_ID=31611 \
forge script script/Deploy.s.sol:Deploy \
  --rpc-url https://rpc.test.mezo.org \
  --broadcast \
  --slow
```

ملاحظات:
- `FEE_BPS=100` = 1% (الحد الأقصى المسموح 500).
- إن كان `REGISTRY_ADMIN` متعدد التواقيع فستحتاج قبول الملكية من الـ Multisig
  بعد النشر بحسب نموذج الملكية في العقد.
- لا تنشر `MockMUSD` على الشبكة الحقيقية إطلاقاً — استعملعنوان Musd الرسمي
  أعلاه.

### منح دور المحلّل (إجباري)

```bash
R_ROLE=$(cast keccak "RESOLVER_ROLE")
cast send <ESCROW_ADDRESS> "grantRole(bytes32,address)" \
  $R_ROLE <RESOLVER_ADDRESS> \
  --rpc-url https://rpc.test.mezo.org --private-key <مفتاح ESCROW_ADMIN>

# تحقق
cast call <ESCROW_ADDRESS> "hasRole(bytes32,address)(bool)" \
  $R_ROLE <RESOLVER_ADDRESS> --rpc-url https://rpc.test.mezo.org   # => true
```

### توثيق العقدتين على المستكشف (Blockscout)

```bash
for C in AgentPolicyRegistry ProcurementEscrow; do
  forge verify-contract <ADDRESS> src/$C.sol:$C \
    --chain-id 31611 \
    --verifier blockscout \
    --verifier-url "https://explorer.test.mezo.org/api"
done
```

أو من واجهة المستكشف: Verify & Publish → Solidity (Standard JSON Input).

---

## الخطوة 3 — توصيل الخادم بالشبكة

انسخ القالب واملأه:

```bash
cd server
cp .env.testnet.example .env
openssl rand -hex 32   # للحقول: SECRET_ENCRYPTION_KEY
```

أهم الحقول (الأسماء مفروضة في الكود ويدققها `loadConfig`):

```
MEZO_CHAIN_ID=31611
MEZO_RPC_URL=https://rpc.test.mezo.org
MEZO_EXPLORER_URL=https://explorer.test.mezo.org
MUSD_ADDRESS=0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503
ESCROW_CONTRACT_ADDRESS=<من deployments/mezo-testnet.json>
REGISTRY_CONTRACT_ADDRESS=<من deployments/mezo-testnet.json>
INDEXER_ENABLED=true
RESOLVER_PRIVATE_KEY=<مفتاح RESOLVER>
BUYER_PRIVATE_KEY=<مفتاح BUYER EXECUTOR>
VENDOR_PRIVATE_KEY=<مفتاح VENDOR EXECUTOR>
SECRET_ENCRYPTION_KEY=<64 خانة hex>
OPERATOR_TOKEN=<قيمة طويلة عشوائية>
ALLOW_BOOTSTRAP=false
```

قاعدة مفروضة في الكود: على أي سلسلة غير محلية يرفض الخادم التوقيع ما لم
تُضبط `BUYER_PRIVATE_KEY` و `VENDOR_PRIVATE_KEY` صراحةً (لا مفاتيح Anvil
افتراضية خارج التطوير المحلي). مولّد Musd التجريبي الآلي (`mint`) يعمل فقط
على `127.0.0.1/localhost` ولا يُستدعى أبداً على Mezo.

ثم شغّل الترحيلات وابدأ:

```bash
npx tsx src/db/migrate.ts
npx tsx src/server.ts
```

---

## الخطوة 4 — أول دورة شراء حقيقية على Mezo

1. أنشئ المؤسسة واضبط محفظة الخزينة إلى `BUYER EXECUTOR` (وحدة
   Organization & Access في الكونسول).
2. منح Musd لمحفظة المشتري: استعراض من `https://testnet.mezo.org` ثم تحويل
   المبلغ إلى `BUYER EXECUTOR`.
3. طلب شراء → نشر → عرض مورد موقّع → ترسية → موافقة بشرية (فوق 500 Musd).
4. Escrow & Settlement: أنشئ الاتفاقية ثم
   `Fund → Accept → Deliver → Release` — كل زر يبث معاملة حقيقية على
   `rpc.test.mezo.org` ويُفهرس بلوك الحدث ورقم الكتلة من السلسلة.
5. تحقق على المستكشف: كل خطوة تعرض `txHash` قابلاً للفتح في
   `explorer.test.mezo.org/tx/<hash>`.

التكاليف الفعلية: غاز BTC على كل معاملة + رسوم بروتوكول 1% من مبلغ
الضمان تذهب إلى `FEE_RECIPIENT` عند التحرير.

---

## الخطوة 5 — فحص ما بعد النشر

```bash
curl -s https://<api-domain>/healthz | jq
curl -s https://<api-domain>/v1/meta | jq .chain
# يجب أن يعرض chainId 31611 وعناوين العقود المنشورة
```

قائمة تحقق أمنية قبل الإطلاق:
- [ ] `ALLOW_BOOTSTRAP=false` و `NODE_ENV=production`.
- [ ] `REGISTRY_ADMIN`/`ESCROW_ADMIN` على Multisig/Timelock (وليس مفتاحاً ساخناً).
- [ ] المفاتيح الأربعة في مدير أسرار (لا ملفات .env في Git).
- [ ] `FEE_RECIPIENT` عنوان خزينة تحت سيطرة المنظمة.
- [ ] نسخة `deployments/mezo-testnet.json` محفوظة مع الحضور على المستكشف.

---

## الانتقال إلى Mezo Mainnet لاحقاً

نفس الخطوات حرفياً مع:

| المعامل | Mainnet |
|---|---|
| معرف السلسلة | `31612` |
| RPC | `https://mezo-mainnet.boar.network` |
| Musd | `0xdD468A1DDc392dcdbEf6db6e34E89AA338F9F186` |
| `EXPECTED_CHAIN_ID` | `31612` |
| `NETWORK` | `mezo-mainnet` |

مع أموال حقيقية: راجع `FEE_BPS`، ونقل الملكية إلى Multisig إلزامي،
وثائق المخاطر في `docs/THREAT_MODEL.md`.
