import './globals.css';
import Sprite from '@/components/Sprite';
import Web3Provider from '@/components/Web3Provider';

export const metadata = {
  title: 'ProMeo · Autonomous AI Agent Procurement Network on Mezo',
  description:
    'Empower autonomous AI agents to discover, negotiate, and settle enterprise services with on-chain MUSD escrow and Merkle audit trails on Mezo Blockchain.',
  applicationName: 'ProMeo',
  icons: {
    icon: [{ url: '/assets/logo.png', type: 'image/png' }],
  },
  openGraph: {
    title: 'ProMeo · Autonomous AI Agent Procurement Network on Mezo',
    description:
      'Autonomous agent procurement, programmatic MUSD escrow, and verifiable Merkle audits on Mezo Blockchain.',
    type: 'website',
  },
};

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#020010',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body suppressHydrationWarning>
        <Sprite />
        <Web3Provider>
          {children}
        </Web3Provider>
      </body>
    </html>
  );
}
