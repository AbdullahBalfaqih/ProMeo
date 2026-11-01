/**
 * Static content for the ProMeo landing page.
 * Tailored for ProMeo · Agent Procurement Network (APN) on Mezo Blockchain.
 */

export const navLinks = [
  { label: 'Home', href: '#home' },
  { label: 'Console', href: '/console' },
  { label: 'Pitch Deck', href: '/deck' },
  { label: 'Services', href: '#services' },
  { label: 'Process', href: '#process' },
  { label: 'Features', href: '#features' },
  { label: 'Settlement', href: '#token' },
  { label: 'Reviews', href: '#testimonials' },
  { label: 'FAQ', href: '#faq' },
];

export const partnerLogos = [
  { src: '/assets/brand/quotient.svg', alt: 'Quotient' },
  { src: '/assets/brand/capsule.svg', alt: 'Capsule' },
  { src: '/assets/brand/nietzsche.svg', alt: 'Nietzsche' },
  { src: '/assets/brand/luminous.svg', alt: 'Luminous' },
  { src: '/assets/brand/focalpoint.svg', alt: 'FocalPoint' },
  { src: '/assets/brand/sisyphus.svg', alt: 'Sisyphus' },
  { src: '/assets/brand/biosynthe.svg', alt: 'Biosynthe' },
  { src: '/assets/brand/galileo.svg', alt: 'Galileo' },
];

export const coinsLeft = [
  { src: '/assets/coins/eth.svg', size: 'sm', alt: 'Ethereum' },
  { src: '/assets/coins/sol.svg', size: 'md', alt: 'Solana' },
  { src: '/assets/coins/btc.svg', size: 'sm', alt: 'Bitcoin' },
  { src: '/assets/mezo.png', size: 'md', alt: 'Mezo MUSD' },
  { src: '/assets/coins/polygon.svg', size: 'sm', alt: 'Polygon' },
];

export const coinsRight = [
  { src: '/assets/coins/usdt.svg', size: 'md', alt: 'Tether USDT' },
  { src: '/assets/coins/usdc.svg', size: 'sm', alt: 'USD Coin' },
  { src: '/assets/BNB.png', size: 'md', alt: 'BNB' },
  { src: '/assets/coins/comp.svg', size: 'sm', alt: 'Compound' },
  { src: '/assets/coins/avax.svg', size: 'md', alt: 'Avalanche' },
];

export const services = {
  custody: {
    key: 'custody',
    tab: 'MUSD Escrow',
    tabIcon: 'i-layers',
    icon: 'i-layers',
    title: 'Smart Contract Escrow on Mezo',
    desc: 'Lock procurement funds programmatically in Mezo smart contracts during service fulfillment. Vendors receive guaranteed payment upon SLA delivery, while buyers enjoy automated refund windows.',
    items: ['Mezo Testnet Chain 31611 settlement', 'Automated release on verified delivery', 'Zero-counterparty risk via MUSD escrow'],
  },
  trading: {
    key: 'trading',
    tab: 'AI Sourcing',
    tabIcon: 'i-candles',
    icon: 'i-candles',
    title: 'Autonomous Agent Sourcing',
    desc: 'Deploy autonomous AI agents that discover vendor offers, evaluate technical specifications, and negotiate optimal prices for GPU compute, storage, and developer APIs.',
    items: ['Autonomous vendor request broadcast', 'Real-time price and SLA negotiation', 'Standardized multi-vendor quote analysis'],
  },
  vesting: {
    key: 'vesting',
    tab: 'Policy Engine',
    tabIcon: 'i-unlock',
    icon: 'i-unlock',
    title: 'Budget & Governance Policies',
    desc: 'Establish strict cryptographic spending bounds and automated approval thresholds. Low-risk micro-purchases flow instantly while high-value outlays trigger human sign-off.',
    items: ['Custom budget caps per agent and time window', 'Human-in-the-loop approval queues', 'Category-level vendor allowlists & blocklists'],
  },
  grant: {
    key: 'grant',
    tab: 'Merkle Audit',
    tabIcon: 'i-bars',
    icon: 'i-bars',
    title: 'Verifiable Audit Integrity',
    desc: 'Every purchase intent, vendor quote, policy check, and escrow release is chained into a SHA-256 Merkle log that provides mathematical proof of compliance and regulatory auditability.',
    items: ['Cryptographically sealed audit trail', 'Instant one-click Merkle verification', 'Tamper-evident logs across every transaction'],
  },
  staking: {
    key: 'staking',
    tab: 'Arbitration',
    tabIcon: 'i-coins',
    icon: 'i-coins',
    title: 'Fair Dispute Resolution',
    desc: 'Transparent dispute arbitration for digital deliverables. Neutral on-chain and off-chain resolvers inspect proof of delivery against agreement terms and release funds fairly.',
    items: ['Evidence submission and timeline tracking', 'Partial or full escrow disbursement', 'Continuous reputation scoring for vendors'],
  },
};

export const serviceOrder = ['custody', 'trading', 'vesting', 'grant', 'staking'];

export const tokenSegments = [
  { name: 'AI Sourcing', pct: '25%', dash: '24.4 75.6', offset: '0', cls: 's1' },
  { name: 'GPU Compute', pct: '25%', dash: '24.4 75.6', offset: '-25', cls: 's2' },
  { name: 'Escrow Reserve', pct: '20%', dash: '19.4 80.6', offset: '-50', cls: 's3' },
  { name: 'Mezo Liquidity', pct: '15%', dash: '14.4 85.6', offset: '-70', cls: 's4' },
  { name: 'Audits & Security', pct: '10%', dash: '9.4 90.6', offset: '-85', cls: 's5' },
  { name: 'Governance', pct: '5%', dash: '4.4 95.6', offset: '-95', cls: 's6' },
];

export const tokenLabels = [
  { name: 'AI Sourcing', pct: '25%', cls: 'tl-1' },
  { name: 'Escrow Reserve', pct: '20%', cls: 'tl-2' },
  { name: 'Audits & Security', pct: '10%', cls: 'tl-3' },
  { name: 'GPU Compute', pct: '25%', cls: 'tr-1' },
  { name: 'Mezo Liquidity', pct: '15%', cls: 'tr-2' },
  { name: 'Governance', pct: '5%', cls: 'tr-3' },
];

export const stats = [
  { value: 100, suffix: '%', label: 'Merkle Audit Integrity' },
  { value: 31611, suffix: '', label: 'Mezo Testnet Chain' },
  { value: 10, suffix: 'X', label: 'Faster AI Procurement' },
];

export const growthBars = [
  { height: '46%', icon: '/assets/coins/sol.svg', pct: '+5.00%' },
  { height: '60%', icon: '/assets/coins/eth.svg', pct: '+4.80%' },
  { height: '76%', icon: '/assets/coins/btc.svg', pct: '+3.00%' },
  { height: '94%', icon: '/assets/coins/dash.svg', pct: '+2.95%' },
];

export const processSteps = [
  {
    cls: 'step-1',
    title: '01. Connect Web3 Wallet',
    text: 'Authenticate seamlessly via Reown AppKit on Mezo Testnet (Chain ID 31611) to instantiate your private organization tenant.',
  },
  {
    cls: 'step-2',
    title: '02. Configure Agents & Policies',
    text: 'Assign autonomous AI agents with dedicated budget caps, category constraints, and automated approval rules.',
  },
  {
    cls: 'step-3',
    title: '03. Lock Escrow in MUSD',
    text: 'Agents broadcast requests, gather competitive quotes, and lock funds safely in the ProcurementEscrow smart contract.',
  },
  {
    cls: 'step-4',
    title: '04. Instant Settlement on Delivery',
    text: 'Verify the deliverable and release payment to the vendor automatically with full Merkle-backed cryptographic audit records.',
  },
];

export const balances = [
  { name: 'MUSD Escrow', amount: '48,500', unit: 'MUSD', usd: '48,500.00 USD', icon: '/assets/mezo.png' },
  { name: 'Mezo Gas (tBTC)', amount: '12.45', unit: 'tBTC', usd: '784,350.00 USD', icon: '/assets/coins/btc.svg' },
  { name: 'Settled to Vendors', amount: '125,800', unit: 'MUSD', usd: '125,800.00 USD', icon: '/assets/mezo.png' },
  { name: 'Active Agreements', amount: '84', unit: 'AGR', usd: '84 Active', icon: '/assets/ui/interlock.svg' },
  { name: 'Procurement Requests', amount: '162', unit: 'REQ', usd: '162 Total', icon: '/assets/logo.png' },
  { name: 'Verified Vendors', amount: '42', unit: 'VND', usd: '100% Verified', icon: '/assets/ui/shield.svg' },
  { name: 'Audit Log Hashes', amount: '1,420', unit: 'EVT', usd: '100% Chained', icon: '/assets/brand/quotient.svg' },
];

export const tools = [
  { icon: 'i-api', label: 'Autonomous Agent APIs' },
  { icon: 'i-refresh', label: 'Programmatic MUSD Escrow' },
  { icon: 'i-shield', label: '100% Merkle Audit Integrity' },
  { icon: 'i-wallet', label: 'Reown AppKit Wallet Auth', hot: true },
  { icon: 'i-globe', label: 'Native Mezo Chain 31611' },
  { icon: 'i-briefcase', label: 'Strict Policy & Budget Caps' },
  { icon: 'i-lock', label: 'Human-in-the-Loop Approvals' },
];

export const integrations = [
  { cls: 'app s1', src: '/assets/marks/luminous.svg', alt: 'Luminous' },
  { cls: 'app s2', src: '/assets/marks/nietzsche.svg', alt: 'Nietzsche' },
  { cls: 'app s3', src: '/assets/marks/capsule.svg', alt: 'Capsule' },
  { cls: 'app s4 center', src: '/assets/marks/sisyphus.svg', alt: 'Sisyphus' },
  { cls: 'app s3', src: '/assets/marks/quotient.svg', alt: 'Quotient' },
  { cls: 'app s2', src: '/assets/marks/galileo.svg', alt: 'Galileo' },
  { cls: 'app s1', src: '/assets/marks/focalpoint.svg', alt: 'FocalPoint' },
];

export const testimonials = [
  {
    col: 'col-1',
    delay: '',
    quote: '“ProMeo APN enabled our autonomous AI agents to procure GPU clusters and API compute with on-chain MUSD escrow on Mezo!”',
    name: 'Wade Warren',
    company: 'Northwind Robotics',
    avatar: '/assets/avatars/people/wade.jpg',
  },
  {
    col: 'col-1',
    delay: '.05s',
    quote: '“The policy governance engine stopped runaway agent spending while auto-approving routine low-value infrastructure in seconds.”',
    name: 'Robert Fox',
    company: 'Helios Compute',
    avatar: '/assets/avatars/people/robert.jpg',
  },
  {
    col: 'col-1',
    delay: '.1s',
    quote: '“With cryptographic Merkle audit logs, our compliance officers have mathematical proof for every single automated procurement order.”',
    name: 'Brooklyn Simmons',
    company: 'Aether Cloud Labs',
    avatar: '/assets/avatars/people/brooklyn.jpg',
  },
  {
    col: 'col-2',
    variant: 'tint',
    delay: '.04s',
    quote: '“Zero counterparty risk for vendors! MUSD is locked in the ProcurementEscrow contract upfront and releases as soon as we deliver.”',
    name: 'Darrell Steward',
    company: 'Nexus Inference',
    avatar: '/assets/avatars/people/darrell.jpg',
  },
  {
    col: 'col-2',
    variant: 'tint-2',
    delay: '.09s',
    quote: '“The Reown AppKit wallet authentication made tenant provisioning seamless. Each wallet gets an isolated workspace instantly.”',
    name: 'Leslie Alexander',
    company: 'Cyberdyne Systems',
    avatar: '/assets/avatars/people/leslie.jpg',
  },
  {
    col: 'col-2',
    delay: '.14s',
    quote: '“The built-in dispute resolution module gave our enterprise clients the exact confidence they needed to automate cloud buying.”',
    name: 'Eleanor Pena',
    company: 'General Autonomous',
    avatar: '/assets/avatars/people/eleanor.jpg',
  },
  {
    col: 'col-3',
    delay: '.02s',
    quote: '“Mezo Chain integration provides instant settlement with negligible gas fees. A massive leap forward for machine-to-machine commerce.”',
    name: 'Albert Flores',
    company: 'OmniCompute',
    avatar: '/assets/avatars/people/albert.jpg',
  },
  {
    col: 'col-3',
    delay: '.07s',
    quote: '“Our procurement cycle dropped from 3 weeks to 3 minutes without sacrificing corporate compliance or human oversight.”',
    name: 'Ronald Richards',
    company: 'Sovereign AI Corp',
    avatar: '/assets/avatars/people/ronald.jpg',
  },
  {
    col: 'col-3',
    delay: '.12s',
    quote: '“The cleanest implementation of Web3 AI procurement. The dashboard gives us complete control over our agent fleet.”',
    name: 'Guy Hawkins',
    company: 'TensorVentures',
    avatar: '/assets/avatars/people/guy.jpg',
  },
];

export const testimonialsColumns = [
  { key: 'col-1', cls: 't-col' },
  { key: 'col-2', cls: 't-col up' },
  { key: 'col-3', cls: 't-col down' },
];

export const faqs = [
  {
    q: 'What is ProMeo Agent Procurement Network (APN)?',
    a: 'ProMeo APN is an autonomous protocol where AI agents discover, negotiate, and procure cloud services and APIs, backed by on-chain escrow in MUSD on Mezo blockchain.',
  },
  {
    q: 'How does escrow settlement work on Mezo?',
    a: 'When an agreement is formed, funds are locked in the ProcurementEscrow smart contract on Mezo Testnet (Chain ID 31611). Funds release automatically to the vendor upon verified delivery or refund if SLAs are breached.',
  },
  {
    q: 'How do humans maintain control over AI agent spending?',
    a: 'Through programmable governance policies. Routine requests under policy limits approve automatically, while larger or sensitive outlays queue for human approval with complete Merkle audit records.',
  },
  {
    q: 'How is wallet authentication handled?',
    a: 'Authentication uses Reown AppKit. Connecting your Web3 wallet instantly provisions and links your isolated organization workspace, ensuring your treasury and agents remain strictly confidential.',
  },
  {
    q: 'Can buyers and vendors raise disputes?',
    a: 'Yes. If a deliverable fails validation, either party can initiate a dispute, freezing escrowed MUSD until evidence is evaluated by designated on-chain or off-chain arbitrators.',
  },
];

export const footerColumns = [
  {
    title: 'Protocol',
    links: [
      { label: 'Home', href: '#home' },
      { label: 'Console', href: '/console' },
      { label: 'Pitch Deck', href: '/deck' },
      { label: 'Services', href: '#services' },
    ],
  },
  {
    title: 'Architecture',
    links: [
      { label: 'Process', href: '#process' },
      { label: 'Integrations', href: '#features' },
      { label: 'Stats', href: '#about' },
    ],
  },
  {
    title: 'Governance',
    links: [
      { label: 'Testimonials', href: '#testimonials' },
      { label: 'Mezo Explorer', href: 'https://explorer.test.mezo.org' },
      { label: 'FAQ', href: '#faq' },
    ],
  },
];

export const socials = [
  { label: 'X (Twitter)', icon: 'i-x', href: 'https://x.com' },
  { label: 'Instagram', icon: 'i-ig', href: 'https://instagram.com' },
  { label: 'LinkedIn', icon: 'i-in', href: 'https://linkedin.com' },
];

export const ctaBars = ['62%', '84%', '48%', '92%', '58%', '76%', '44%', '88%', '54%', '70%', '40%', '80%', '60%'];

export const partnerBars = ['46%', '62%', '78%', '58%', '88%', '70%', '52%', '66%'];
