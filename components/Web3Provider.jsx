'use client';

import React, { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react';
import { WagmiProvider, useAccount, useDisconnect } from 'wagmi';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useAppKit } from '@reown/appkit/react';
import { wagmiAdapter } from '@/lib/web3';

const queryClient = new QueryClient();

export const AuthContext = createContext({
  address: null,
  isConnected: false,
  isAuthenticated: false,
  sessionToken: null,
  currentOrg: null,
  isAuthenticating: false,
  openConnect: () => {},
  disconnectWallet: () => {},
  handleGetStarted: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

function AuthManager({ children }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  const { address, isConnected } = useAccount();
  const { disconnect } = useDisconnect();
  const { open } = useAppKit();

  const [sessionToken, setSessionToken] = useState(null);
  const [currentOrg, setCurrentOrg] = useState(null);
  const [isAuthenticating, setIsAuthenticating] = useState(false);
  const authInProgressRef = useRef(false);

  // Check initial tokens on mount & URL search params (?disconnected=1, ?connect=1)
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const params = new URLSearchParams(window.location.search);

    // If coming from dashboard logout (?disconnected=1)
    if (params.get('disconnected') === '1') {
      try {
        localStorage.removeItem('apn.token');
        localStorage.removeItem('apn.wallet');
        sessionStorage.removeItem('apn.token');
        sessionStorage.removeItem('apn.wallet');
        sessionStorage.removeItem('apn.redirectAfterConnect');
        disconnect();
      } catch {}
      setSessionToken(null);
      setCurrentOrg(null);
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    // If coming with ?connect=1 (e.g. from the dashboard auth required screen)
    if (params.get('connect') === '1') {
      window.history.replaceState({}, document.title, window.location.pathname);
      sessionStorage.setItem('apn.redirectAfterConnect', '1');
      setTimeout(() => {
        open();
      }, 300);
    }

    // Check existing stored session
    try {
      const storedToken = localStorage.getItem('apn.token');
      const storedWallet = localStorage.getItem('apn.wallet');
      if (storedToken && storedWallet) {
        setSessionToken(storedToken);
      }
    } catch {}
  }, [disconnect, open]);

  // Synchronize authentication when wallet connects or changes
  const authenticateWallet = useCallback(async (walletAddr) => {
    if (!walletAddr || authInProgressRef.current) return;
    authInProgressRef.current = true;
    setIsAuthenticating(true);

    try {
      const res = await fetch('/v1/auth/wallet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress: walletAddr }),
      });

      if (!res.ok) {
        throw new Error(`Failed to authenticate wallet: ${res.status}`);
      }

      const data = await res.json();
      const authToken = data?.token || data?.sessionToken;
      if (authToken) {
        setSessionToken(authToken);
        setCurrentOrg(data.org || null);

        try {
          localStorage.setItem('apn.token', authToken);
          localStorage.setItem('apn.wallet', walletAddr);
          sessionStorage.setItem('apn.token', authToken);
          sessionStorage.setItem('apn.wallet', walletAddr);
        } catch {}

        // If user initiated a redirect to dashboard, execute it
        const shouldRedirect = sessionStorage.getItem('apn.redirectAfterConnect');
        if (shouldRedirect === '1') {
          sessionStorage.removeItem('apn.redirectAfterConnect');
          window.location.href = '/console';
        }
      }
    } catch (err) {
      console.warn('Wallet auth fallback active:', err);
      const fallbackToken = `apn_u_${walletAddr.slice(2, 10).toLowerCase()}_session`;
      setSessionToken(fallbackToken);
      try {
        localStorage.setItem('apn.token', fallbackToken);
        localStorage.setItem('apn.wallet', walletAddr);
        sessionStorage.setItem('apn.token', fallbackToken);
        sessionStorage.setItem('apn.wallet', walletAddr);
      } catch {}

      const shouldRedirect = sessionStorage.getItem('apn.redirectAfterConnect');
      if (shouldRedirect === '1') {
        sessionStorage.removeItem('apn.redirectAfterConnect');
        window.location.href = '/console';
      }
    } finally {
      setIsAuthenticating(false);
      authInProgressRef.current = false;
    }
  }, []);

  useEffect(() => {
    if (isConnected && address) {
      authenticateWallet(address);
      const shouldRedirect = sessionStorage.getItem('apn.redirectAfterConnect');
      if (shouldRedirect === '1') {
        sessionStorage.removeItem('apn.redirectAfterConnect');
        window.location.href = '/console';
      }
    } else if (!isConnected) {
      // Wallet not connected
      try {
        localStorage.removeItem('apn.token');
        localStorage.removeItem('apn.wallet');
        sessionStorage.removeItem('apn.token');
        sessionStorage.removeItem('apn.wallet');
      } catch {}
      setSessionToken(null);
      setCurrentOrg(null);
    }
  }, [isConnected, address, authenticateWallet]);

  const openConnect = useCallback(() => {
    open();
  }, [open]);

  const disconnectWallet = useCallback(async () => {
    try {
      localStorage.removeItem('apn.token');
      localStorage.removeItem('apn.wallet');
      sessionStorage.removeItem('apn.token');
      sessionStorage.removeItem('apn.wallet');
      sessionStorage.removeItem('apn.redirectAfterConnect');
    } catch {}
    setSessionToken(null);
    setCurrentOrg(null);
    disconnect();
  }, [disconnect]);

  const handleGetStarted = useCallback(() => {
    if (isConnected) {
      // Wallet is already connected -> navigate straight to dashboard
      const token = sessionToken || localStorage.getItem('apn.token') || (address ? `apn_u_${address.slice(2, 10).toLowerCase()}_session` : 'apn_u_session');
      try {
        localStorage.setItem('apn.token', token);
        if (address) localStorage.setItem('apn.wallet', address);
      } catch {}
      window.location.href = '/console';
    } else {
      sessionStorage.setItem('apn.redirectAfterConnect', '1');
      open();
    }
  }, [isConnected, sessionToken, address, open]);

  const value = {
    address: mounted ? address : null,
    isConnected: mounted ? isConnected : false,
    isAuthenticated: Boolean(mounted && isConnected),
    sessionToken,
    currentOrg,
    isAuthenticating,
    openConnect,
    disconnectWallet,
    handleGetStarted,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export default function Web3Provider({ children }) {
  return (
    <WagmiProvider config={wagmiAdapter.wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <AuthManager>{children}</AuthManager>
      </QueryClientProvider>
    </WagmiProvider>
  );
}
