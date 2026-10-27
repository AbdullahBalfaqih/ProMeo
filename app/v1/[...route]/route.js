export const dynamic = 'force-dynamic';

// In-memory persistent state across requests in lambda container
const MEZO_CHAIN_ID = 31611;
const ESCROW_ADDRESS = '0x88EDbF3E966Ba23F0262771CBCF6d217718BD048';
const REGISTRY_ADDRESS = '0x957dbD62B6aF0C13C94D07814B06323d53198ccC';
const MUSD_ADDRESS = '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503';

const state = {
  org: {
    id: 'org-mezo-promeo-01',
    name: 'ProMeo Autonomous Enterprise',
    slug: 'promeo-network',
    status: 'active',
    chainId: MEZO_CHAIN_ID,
    walletAddress: ESCROW_ADDRESS,
    createdAt: '2026-10-25T10:00:00.000Z',
  },
  agents: [
    {
      id: 'agt-procure-01',
      name: 'Titan Procurement Agent',
      walletAddress: '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC',
      status: 'active',
      trustLevel: 3,
      dailyBudget: '5000000000000000000000',
      dailySpend: '1500000000000000000000',
      createdAt: '2026-10-25T10:30:00.000Z',
    },
    {
      id: 'agt-compute-02',
      name: 'GPU Cluster Orchestrator',
      walletAddress: '0x90F79bf6EB2c4f870365E785982E1f101E93b906',
      status: 'active',
      trustLevel: 2,
      dailyBudget: '2500000000000000000000',
      dailySpend: '650000000000000000000',
      createdAt: '2026-10-26T08:15:00.000Z',
    },
  ],
  vendors: [
    {
      id: 'vnd-helios-01',
      name: 'Helios Compute Cloud',
      payoutAddress: '0x5A88a0e9c89420Ec2f62F5aAb6b797f1B6c278E6',
      status: 'active',
      verified: true,
      tier: 1,
      contactEmail: 'services@helios.mezo',
      description: 'Ultra-low latency GPU reasoning clusters verified on Mezo.',
      createdAt: '2026-10-24T12:00:00.000Z',
    },
    {
      id: 'vnd-aether-02',
      name: 'Aether Data Feeds',
      payoutAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      status: 'active',
      verified: true,
      tier: 2,
      contactEmail: 'oracles@aether.network',
      description: 'Real-time financial and procurement telemetry feeds.',
      createdAt: '2026-10-25T14:00:00.000Z',
    },
  ],
  requests: [
    {
      id: 'req-001',
      reference: 'REQ-MEZO-2026-001',
      title: 'Autonomous Llama 3 70B Dedicated Cluster',
      description: 'Dedicated GPU inference capacity for continuous multi-agent execution.',
      category: 'compute',
      budgetAmount: '1500000000000000000000',
      budgetDisplay: '1,500.00 MUSD',
      currency: 'MUSD',
      status: 'awarded',
      policyDecision: 'allow',
      deadlineAt: '2026-11-01T00:00:00.000Z',
      createdAt: '2026-10-26T14:22:00.000Z',
    },
    {
      id: 'req-002',
      reference: 'REQ-MEZO-2026-002',
      title: 'Enterprise Vector Retrieval & Mezo Indexer',
      description: 'Dedicated indexer node for Mezo block events and Merkle root checkpoints.',
      category: 'storage',
      budgetAmount: '650000000000000000000',
      budgetDisplay: '650.00 MUSD',
      currency: 'MUSD',
      status: 'open',
      policyDecision: 'allow',
      deadlineAt: '2026-11-05T00:00:00.000Z',
      createdAt: '2026-10-27T08:15:00.000Z',
    },
  ],
  agreements: [
    {
      id: 'agr-001',
      onchainId: '0x7a3f912c4b8e210984f18b5c92e1048b26f8d098e1f5793081e7d0234a9b81cf',
      requestId: 'req-001',
      vendorId: 'vnd-helios-01',
      vendorName: 'Helios Compute Cloud',
      chainId: MEZO_CHAIN_ID,
      escrowAddress: ESCROW_ADDRESS,
      buyerAddress: '0xE3467C87403f86292256633B5e068F5385446Cfa',
      vendorAddress: '0x5A88a0e9c89420Ec2f62F5aAb6b797f1B6c278E6',
      amount: '1500000000000000000000',
      amountDisplay: '1,500.00 MUSD',
      feeAmount: '7500000000000000000',
      state: 'funded',
      fundingTxHash: '0x51b72e09477a3d348a52e729a43a0d319cfd93d39bc1310188ef77a06a09e394',
      acceptBy: '2026-10-28T12:00:00.000Z',
      deliverBy: '2026-10-31T12:00:00.000Z',
      disputeWindowSeconds: 86400,
      createdAt: '2026-10-26T15:30:00.000Z',
    },
    {
      id: 'agr-002',
      onchainId: '0x12c4b8e210984f18b5c92e1048b26f8d098e1f5793081e7d0234a9b81cf7a3f9',
      requestId: 'req-002',
      vendorId: 'vnd-aether-02',
      vendorName: 'Aether Data Feeds',
      chainId: MEZO_CHAIN_ID,
      escrowAddress: ESCROW_ADDRESS,
      buyerAddress: '0xE3467C87403f86292256633B5e068F5385446Cfa',
      vendorAddress: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
      amount: '650000000000000000000',
      amountDisplay: '650.00 MUSD',
      feeAmount: '3250000000000000000',
      state: 'released',
      fundingTxHash: '0x9812afc830182b8273910c283719283712983712983712983712983712983712',
      acceptBy: '2026-10-25T12:00:00.000Z',
      deliverBy: '2026-10-26T12:00:00.000Z',
      disputeWindowSeconds: 86400,
      createdAt: '2026-10-25T11:00:00.000Z',
    },
  ],
  approvals: [
    {
      id: 'appr-001',
      requestId: 'req-002',
      status: 'pending',
      amount: '650000000000000000000',
      reason: 'Dual-approval threshold exceeded for single service purchase.',
      expiresAt: '2026-10-29T00:00:00.000Z',
      createdAt: '2026-10-27T08:20:00.000Z',
    },
  ],
  disputes: [],
  policies: [
    {
      id: 'pol-001',
      version: 1,
      status: 'active',
      name: 'Default Mezo Risk & Budget Policy',
      document: {
        maxSingleSpendMUSD: 5000,
        requireDualApprovalOverMUSD: 500,
        allowedCurrencies: ['MUSD'],
        requireEscrow: true,
      },
      documentHash: '0x498e21a7c0018f219cb2e01938210491823bc',
      activatedAt: '2026-10-25T10:00:00.000Z',
      createdAt: '2026-10-25T10:00:00.000Z',
    },
  ],
  apiKeys: [
    {
      id: 'key-001',
      name: 'Operator Primary Session Key',
      prefix: 'apn_u_operator',
      scopes: ['*'],
      createdAt: '2026-10-25T10:00:00.000Z',
    },
  ],
  webhooks: [
    {
      id: 'whk-001',
      url: 'https://api.promeo.network/webhooks/mezo-events',
      description: 'Mezo Escrow Settlement & Agent Event Dispatcher',
      events: ['agreement.funded', 'agreement.released', 'request.awarded'],
      active: true,
      createdAt: '2026-10-25T10:00:00.000Z',
    },
  ],
  audit: [
    {
      id: 'aud-001',
      action: 'escrow.funded',
      actorType: 'agent',
      actorId: 'agt-procure-01',
      resourceType: 'agreement',
      resourceId: 'agr-001',
      hash: '0x918374a9b2019483719827391827391827391827391827391827391827391827',
      createdAt: '2026-10-26T15:31:00.000Z',
    },
    {
      id: 'aud-002',
      action: 'agreement.released',
      actorType: 'user',
      actorId: 'usr_wallet_operator',
      resourceType: 'agreement',
      resourceId: 'agr-002',
      hash: '0x7129837129837129837129837129837129837129837129837129837129837129',
      createdAt: '2026-10-26T16:00:00.000Z',
    },
  ],
};

function json(data, status = 200) {
  return Response.json(data, {
    status,
    headers: {
      'content-type': 'application/json',
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'access-control-allow-headers': '*',
    },
  });
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      'access-control-allow-origin': '*',
      'access-control-allow-methods': 'GET, POST, PUT, DELETE, PATCH, OPTIONS',
      'access-control-allow-headers': '*',
    },
  });
}

export async function GET(req, { params }) {
  const segments = (await params).route || [];
  const fullPath = segments.join('/');

  if (fullPath === 'meta') {
    return json({
      api: { name: 'Agent Procurement Network', version: '1.0.0', build: '0.1.0' },
      chain: {
        name: 'Mezo Testnet',
        chainId: MEZO_CHAIN_ID,
        rpcUrl: 'https://rpc.test.mezo.org',
        explorer: 'https://explorer.test.mezo.org',
        escrow: ESCROW_ADDRESS,
        registry: REGISTRY_ADDRESS,
        musd: MUSD_ADDRESS,
      },
      currency: { symbol: 'MUSD', decimals: 18 },
      webhooks: {
        signatureHeader: 'x-apn-signature',
        timestampHeader: 'x-apn-timestamp',
        algorithm: 'HMAC-SHA256 over `<timestamp>.<raw body>`, hex, prefixed v1=',
        events: [
          'request.created',
          'request.published',
          'offer.submitted',
          'agreement.created',
          'agreement.funded',
          'agreement.released',
          'dispute.opened',
          'dispute.resolved',
        ],
      },
      policy: { note: 'deny-overrides, immutable versions, evaluated server-side' },
      capabilities: {
        bootstrap: true,
        indexer: true,
        webhooks: true,
        disputeResolution: true,
      },
    });
  }

  if (fullPath === 'bootstrap/status') {
    return json({
      enabled: true,
      demoPrincipals: {
        northwind_owner: 'apn_u_northwind_owner_token',
        northwind_approver: 'apn_u_northwind_approver_token',
        acme_agent: 'apn_a_acme_agent_token',
      },
    });
  }

  if (fullPath === 'org') {
    return json({
      org: state.org,
      role: 'owner',
      principal: 'user',
      user: {
        id: 'usr_wallet_operator',
        email: 'operator@promeo.network',
        role: 'owner',
        displayName: 'Wallet Operator',
      },
    });
  }

  if (fullPath === 'requests') {
    return json({ data: state.requests });
  }

  if (fullPath.startsWith('requests/') && segments.length === 2) {
    const reqItem = state.requests.find((r) => r.id === segments[1]) || state.requests[0];
    return json(reqItem);
  }

  if (fullPath.endsWith('/offers')) {
    return json({
      data: [
        {
          id: 'ofr-001',
          vendorId: 'vnd-helios-01',
          vendorName: 'Helios Compute Cloud',
          priceAmount: '1480000000000000000000',
          priceDisplay: '1,480.00 MUSD',
          deliveryDays: 1,
          rankScore: 98,
          status: 'accepted',
          canonicalHash: '0x812498129841289412',
        },
      ],
    });
  }

  if (fullPath.endsWith('/discover')) {
    return json({
      recommended: [
        {
          vendorId: 'vnd-helios-01',
          vendorName: 'Helios Compute Cloud',
          quote: '1,480.00 MUSD',
          delivery: 'Immediate',
        },
      ],
    });
  }

  if (fullPath === 'approvals') {
    return json({ data: state.approvals });
  }

  if (fullPath === 'agreements') {
    return json({ data: state.agreements });
  }

  if (fullPath.startsWith('agreements/') && segments.length === 2) {
    const agr = state.agreements.find((a) => a.id === segments[1]) || state.agreements[0];
    return json(agr);
  }

  if (fullPath === 'disputes') {
    return json({ data: state.disputes });
  }

  if (fullPath === 'agents') {
    return json({ data: state.agents });
  }

  if (fullPath.startsWith('agents/') && segments.length === 2) {
    const agt = state.agents.find((a) => a.id === segments[1]) || state.agents[0];
    return json(agt);
  }

  if (fullPath === 'vendors') {
    return json({ data: state.vendors });
  }

  if (fullPath === 'policies') {
    return json({ data: state.policies });
  }

  if (fullPath === 'api-keys') {
    return json({ data: state.apiKeys });
  }

  if (fullPath === 'webhooks') {
    return json({ data: state.webhooks });
  }

  if (fullPath === 'audit') {
    return json({ data: state.audit });
  }

  if (fullPath === 'audit/verify') {
    return json({
      valid: true,
      checked: state.audit.length + 140,
      root: '0x3f4a91b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0',
    });
  }

  return json({ data: [] });
}

export async function POST(req, { params }) {
  const segments = (await params).route || [];
  const fullPath = segments.join('/');

  let body = {};
  try {
    body = await req.json();
  } catch {}

  if (fullPath === 'auth/wallet') {
    const walletAddress = body.walletAddress || '0x88EDbF3E966Ba23F0262771CBCF6d217718BD048';
    const short = `${walletAddress.slice(0, 6)}…${walletAddress.slice(-4)}`;
    state.org.walletAddress = walletAddress;
    state.org.name = `Org ${short}`;

    return json({
      org: state.org,
      user: {
        id: 'usr_wallet_operator',
        email: 'operator@promeo.network',
        role: 'owner',
        displayName: `Operator (${short})`,
      },
      token: `apn_u_${walletAddress.slice(2, 10).toLowerCase()}_session`,
      sessionToken: `apn_u_${walletAddress.slice(2, 10).toLowerCase()}_session`,
      isNew: false,
    });
  }

  if (fullPath === 'requests') {
    const newReq = {
      id: `req-${Date.now().toString(36)}`,
      reference: `REQ-MEZO-${Math.floor(1000 + Math.random() * 9000)}`,
      title: body.title || 'Enterprise Compute Procurement',
      description: body.description || 'Autonomous agent procurement request',
      category: body.category || 'compute',
      budgetAmount: body.budgetAmount || '100000000000000000000',
      budgetDisplay: `${Number(BigInt(body.budgetAmount || '100000000000000000000') / 10n ** 18n).toFixed(2)} MUSD`,
      currency: 'MUSD',
      status: 'open',
      createdAt: new Date().toISOString(),
    };
    state.requests.unshift(newReq);
    return json({ request: newReq }, 201);
  }

  if (fullPath.endsWith('/publish')) {
    const reqId = segments[1];
    const item = state.requests.find((r) => r.id === reqId);
    if (item) item.status = 'open';
    return json({ ok: true, request: item });
  }

  if (fullPath.endsWith('/award')) {
    const reqId = segments[1];
    const item = state.requests.find((r) => r.id === reqId);
    if (item) item.status = 'awarded';
    return json({ ok: true, request: item });
  }

  if (fullPath.endsWith('/decide')) {
    const appId = segments[1];
    state.approvals = state.approvals.filter((a) => a.id !== appId);
    return json({ ok: true, decided: true });
  }

  if (fullPath.startsWith('agreements') && fullPath.includes('/execute/')) {
    const action = segments[segments.length - 1];
    const agrId = segments[1];
    const item = state.agreements.find((a) => a.id === agrId);
    if (item) {
      if (action === 'release') item.state = 'released';
      if (action === 'refund') item.state = 'refunded';
      if (action === 'dispute') item.state = 'disputed';
    }
    return json({ ok: true, state: item?.state || action });
  }

  if (fullPath === 'agreements') {
    const newAgr = {
      id: `agr-${Date.now().toString(36)}`,
      onchainId: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      requestId: body.requestId || 'req-001',
      vendorId: body.vendorId || 'vnd-helios-01',
      vendorName: 'Helios Compute Cloud',
      chainId: MEZO_CHAIN_ID,
      escrowAddress: ESCROW_ADDRESS,
      buyerAddress: state.org.walletAddress,
      vendorAddress: '0x5A88a0e9c89420Ec2f62F5aAb6b797f1B6c278E6',
      amount: '500000000000000000000',
      amountDisplay: '500.00 MUSD',
      feeAmount: '2500000000000000000',
      state: 'funded',
      fundingTxHash: `0x${Array.from({ length: 64 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      acceptBy: new Date(Date.now() + 86400000).toISOString(),
      deliverBy: new Date(Date.now() + 86400000 * 3).toISOString(),
      disputeWindowSeconds: 86400,
      createdAt: new Date().toISOString(),
    };
    state.agreements.unshift(newAgr);
    return json({ agreement: newAgr }, 201);
  }

  if (fullPath === 'agents') {
    const newAgent = {
      id: `agt-${Date.now().toString(36)}`,
      name: body.name || 'New AI Procurement Agent',
      walletAddress: body.walletAddress || `0x${Array.from({ length: 40 }, () => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      status: 'active',
      trustLevel: body.trustLevel || 1,
      dailyBudget: body.dailyBudget || '1000000000000000000000',
      dailySpend: '0',
      createdAt: new Date().toISOString(),
    };
    state.agents.push(newAgent);
    return json({ agent: newAgent }, 201);
  }

  if (fullPath.endsWith('/credentials')) {
    return json({
      token: `apn_a_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`,
      label: body.label || 'Minted credential',
    }, 201);
  }

  if (fullPath === 'api-keys') {
    const token = `apn_u_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
    const newKey = {
      id: `key-${Date.now().toString(36)}`,
      name: body.name || 'Operator API Key',
      prefix: token.slice(0, 14),
      scopes: body.scopes || ['*'],
      createdAt: new Date().toISOString(),
    };
    state.apiKeys.push(newKey);
    return json({ token, key: newKey }, 201);
  }

  return json({ ok: true, received: true });
}

export async function DELETE(req, { params }) {
  return json({ ok: true, deleted: true });
}
