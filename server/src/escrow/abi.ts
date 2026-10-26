/**
 * Minimal ABIs for the deployed contracts. Kept hand-written and small so the
 * backend does not ship the full build artifacts.
 */
export const escrowAbi = [
  {
    type: "function",
    name: "createAgreement",
    stateMutability: "nonpayable",
    inputs: [
      { name: "buyer", type: "address" },
      {
        name: "p",
        type: "tuple",
        components: [
          { name: "orgId", type: "bytes32" },
          { name: "requestId", type: "bytes32" },
          { name: "offerHash", type: "bytes32" },
          { name: "termsHash", type: "bytes32" },
          { name: "vendor", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "acceptBy", type: "uint64" },
          { name: "deliverBy", type: "uint64" },
          { name: "disputeWindow", type: "uint64" },
          { name: "nonce", type: "uint256" },
          { name: "feeOnTop", type: "bool" },
        ],
      },
    ],
    outputs: [{ name: "agreementId", type: "bytes32" }],
  },
  {
    type: "function",
    name: "agreementIdFor",
    stateMutability: "view",
    inputs: [
      { name: "orgId", type: "bytes32" },
      { name: "requestId", type: "bytes32" },
      { name: "offerHash", type: "bytes32" },
      { name: "nonce", type: "uint256" },
    ],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "quoteFee",
    stateMutability: "view",
    inputs: [{ name: "amount", type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  { type: "function", name: "feeBps", stateMutability: "view", inputs: [], outputs: [{ type: "uint16" }] },
  {
    type: "function",
    name: "accept",
    stateMutability: "nonpayable",
    inputs: [{ name: "agreementId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "submitDelivery",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agreementId", type: "bytes32" },
      { name: "proofHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "claimAfterDisputeWindow",
    stateMutability: "nonpayable",
    inputs: [{ name: "agreementId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "release",
    stateMutability: "nonpayable",
    inputs: [{ name: "agreementId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "cancelUnaccepted",
    stateMutability: "nonpayable",
    inputs: [{ name: "agreementId", type: "bytes32" }],
    outputs: [],
  },
  {
    type: "function",
    name: "dispute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agreementId", type: "bytes32" },
      { name: "evidenceHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "resolveDispute",
    stateMutability: "nonpayable",
    inputs: [
      { name: "agreementId", type: "bytes32" },
      { name: "vendorAmount", type: "uint256" },
      { name: "rulingHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "hasRole",
    stateMutability: "view",
    inputs: [
      { name: "role", type: "bytes32" },
      { name: "account", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "RESOLVER_ROLE",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bytes32" }],
  },
  {
    type: "function",
    name: "getAgreement",
    stateMutability: "view",
    inputs: [{ name: "agreementId", type: "bytes32" }],
    outputs: [
      {
        type: "tuple",
        components: [
          { name: "id", type: "bytes32" },
          { name: "orgId", type: "bytes32" },
          { name: "requestId", type: "bytes32" },
          { name: "offerHash", type: "bytes32" },
          { name: "termsHash", type: "bytes32" },
          { name: "buyer", type: "address" },
          { name: "vendor", type: "address" },
          { name: "amount", type: "uint256" },
          { name: "feeAmount", type: "uint256" },
          { name: "createdAt", type: "uint64" },
          { name: "acceptBy", type: "uint64" },
          { name: "deliverBy", type: "uint64" },
          { name: "disputeWindow", type: "uint64" },
          { name: "state", type: "uint8" },
          { name: "deliveryCount", type: "uint8" },
          { name: "feeOnTop", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "AgreementCreated",
    inputs: [
      { indexed: true, name: "agreementId", type: "bytes32" },
      { indexed: true, name: "orgId", type: "bytes32" },
      { indexed: true, name: "requestId", type: "bytes32" },
      { indexed: false, name: "buyer", type: "address" },
      { indexed: false, name: "vendor", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "feeAmount", type: "uint256" },
      { indexed: false, name: "offerHash", type: "bytes32" },
      { indexed: false, name: "termsHash", type: "bytes32" },
      { indexed: false, name: "acceptBy", type: "uint64" },
      { indexed: false, name: "deliverBy", type: "uint64" },
      { indexed: false, name: "disputeWindow", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "AgreementAccepted",
    inputs: [
      { indexed: true, name: "agreementId", type: "bytes32" },
      { indexed: true, name: "vendor", type: "address" },
      { indexed: false, name: "acceptedAt", type: "uint64" },
    ],
  },
  {
    type: "event",
    name: "DeliverySubmitted",
    inputs: [
      { indexed: true, name: "agreementId", type: "bytes32" },
      { indexed: true, name: "vendor", type: "address" },
      { indexed: false, name: "proofHash", type: "bytes32" },
      { indexed: false, name: "deliveryCount", type: "uint8" },
    ],
  },
  {
    type: "event",
    name: "AgreementReleased",
    inputs: [
      { indexed: true, name: "agreementId", type: "bytes32" },
      { indexed: true, name: "vendor", type: "address" },
      { indexed: false, name: "vendorAmount", type: "uint256" },
      { indexed: false, name: "feeAmount", type: "uint256" },
    ],
  },
  {
    type: "event",
    name: "AgreementRefunded",
    inputs: [
      { indexed: true, name: "agreementId", type: "bytes32" },
      { indexed: true, name: "buyer", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
      { indexed: false, name: "reasonHash", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "AgreementDisputed",
    inputs: [
      { indexed: true, name: "agreementId", type: "bytes32" },
      { indexed: true, name: "initiator", type: "address" },
      { indexed: false, name: "evidenceHash", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "DisputeResolved",
    inputs: [
      { indexed: true, name: "agreementId", type: "bytes32" },
      { indexed: false, name: "vendorAmount", type: "uint256" },
      { indexed: false, name: "buyerAmount", type: "uint256" },
      { indexed: false, name: "feeAmount", type: "uint256" },
      { indexed: false, name: "rulingHash", type: "bytes32" },
    ],
  },
  {
    type: "event",
    name: "AgreementCancelled",
    inputs: [
      { indexed: true, name: "agreementId", type: "bytes32" },
      { indexed: true, name: "buyer", type: "address" },
      { indexed: false, name: "amount", type: "uint256" },
    ],
  },
] as const;

export const registryAbi = [
  {
    type: "function",
    name: "setAgentAuthorization",
    stateMutability: "nonpayable",
    inputs: [
      { name: "orgId", type: "bytes32" },
      { name: "agent", type: "address" },
      { name: "authorized", type: "bool" },
      { name: "validUntil", type: "uint64" },
      { name: "policyHash", type: "bytes32" },
    ],
    outputs: [],
  },
  {
    type: "function",
    name: "isAuthorized",
    stateMutability: "view",
    inputs: [
      { name: "orgId", type: "bytes32" },
      { name: "agent", type: "address" },
    ],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "authorizationOf",
    stateMutability: "view",
    inputs: [
      { name: "orgId", type: "bytes32" },
      { name: "agent", type: "address" },
    ],
    outputs: [
      { name: "authorized", type: "bool" },
      { name: "validUntil", type: "uint64" },
      { name: "policyHash", type: "bytes32" },
      { name: "orgFrozen", type: "bool" },
    ],
  },
] as const;

export const erc20Abi = [
  { type: "function", name: "balanceOf", stateMutability: "view", inputs: [{ name: "a", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "allowance", stateMutability: "view", inputs: [{ name: "o", type: "address" }, { name: "s", type: "address" }], outputs: [{ type: "uint256" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;
