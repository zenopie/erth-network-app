import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { connectKeplr, disconnect, getAddress } from "../chain/tx";

/**
 * Wallet state for the earth chain.
 *
 * Earth is transparent, so connecting is just "which address are we?" — there
 * are no query permits, viewing keys or contract registry to load. Balances are
 * public, so pages can read chain state before a wallet is connected.
 */
const WalletContext = createContext(null);

export const useWallet = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
};

const STORED_ADDRESS_KEY = "earth_address";

export const WalletProvider = ({ children }) => {
  const [address, setAddress] = useState(null);
  const [walletName, setWalletName] = useState("");
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");

  const isConnected = address !== null;

  const connect = useCallback(async () => {
    setIsConnecting(true);
    setConnectError("");
    try {
      const { address: addr, name } = await connectKeplr();
      setAddress(addr);
      setWalletName(name);
      localStorage.setItem(STORED_ADDRESS_KEY, addr);
    } catch (err) {
      console.error("Wallet connect error:", err);
      setConnectError(err.message || "Failed to connect. Please try again.");
      throw err;
    } finally {
      setIsConnecting(false);
    }
  }, []);

  const handleDisconnect = useCallback(() => {
    disconnect();
    setAddress(null);
    setWalletName("");
    localStorage.removeItem(STORED_ADDRESS_KEY);
  }, []);

  // Reconnect silently if this browser connected before. Keplr remembers the
  // approval, so this does not prompt the user again.
  useEffect(() => {
    if (!localStorage.getItem(STORED_ADDRESS_KEY) || !window.keplr) return;
    connect().catch(() => localStorage.removeItem(STORED_ADDRESS_KEY));
  }, [connect]);

  // Switching accounts in Keplr must not leave a stale address on screen.
  useEffect(() => {
    const onKeystoreChange = () => {
      if (getAddress()) connect().catch(() => {});
    };
    window.addEventListener("keplr_keystorechange", onKeystoreChange);
    return () => window.removeEventListener("keplr_keystorechange", onKeystoreChange);
  }, [connect]);

  return (
    <WalletContext.Provider
      value={{
        address,
        walletName,
        isConnected,
        isConnecting,
        connectError,
        connect,
        disconnect: handleDisconnect,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export default WalletContext;
