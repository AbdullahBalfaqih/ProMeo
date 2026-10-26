import { createAppKit } from '@reown/appkit/react';
import { WagmiAdapter } from '@reown/appkit-adapter-wagmi';
import { defineChain } from '@reown/appkit/networks';

export const PROJECT_ID = '67f34381083587b27e807ef27b042a51';

export const mezoTestnet = defineChain({
  id: 31611,
  name: 'Mezo Testnet',
  nativeCurrency: { name: 'tBTC', symbol: 'tBTC', decimals: 18 },
  rpcUrls: {
    default: { http: ['https://rpc.test.mezo.org'] },
  },
  blockExplorers: {
    default: { name: 'Mezo Explorer', url: 'https://explorer.test.mezo.org' },
  },
});

export const networks = [mezoTestnet];

export const wagmiAdapter = new WagmiAdapter({
  projectId: PROJECT_ID,
  networks,
});

export const metadata = {
  name: 'ProMeo · Agent Procurement Network',
  description: 'AI Autonomous Agent Procurement on Mezo',
  url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
  icons: ['/assets/logo.png'],
};

// Initialize AppKit modal
export const appKit = createAppKit({
  adapters: [wagmiAdapter],
  networks,
  defaultNetwork: mezoTestnet,
  projectId: PROJECT_ID,
  metadata,
  features: {
    analytics: false,
    email: false,
    socials: [],
  },
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#6d3fea',
    '--w3m-border-radius-master': '16px',
    '--w3m-z-index': 999999,
  },
});
