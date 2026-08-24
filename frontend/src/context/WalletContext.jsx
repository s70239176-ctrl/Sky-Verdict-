import React, { createContext, useCallback, useContext, useState } from "react";
import { connectWallet, connectDemoAccount, disconnect, getCurrentAccount } from "../lib/genlayerClient";

const WalletContext = createContext(null);

export function WalletProvider({ children }) {
  const [account, setAccount] = useState(getCurrentAccount());
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState(null);

  const connectReal = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const acc = await connectWallet();
      setAccount(acc);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const connectDemo = useCallback(async () => {
    setConnecting(true);
    setError(null);
    try {
      const acc = await connectDemoAccount();
      setAccount(acc);
    } catch (e) {
      setError(e.message || String(e));
    } finally {
      setConnecting(false);
    }
  }, []);

  const disconnectAccount = useCallback(() => {
    disconnect();
    setAccount(null);
  }, []);

  return (
    <WalletContext.Provider
      value={{ account, connecting, error, connectReal, connectDemo, disconnectAccount }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside WalletProvider");
  return ctx;
}
