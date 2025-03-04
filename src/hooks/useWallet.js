import { useState, useEffect, useCallback } from "react";

/**
 * Custom hook to handle wallet connection
 * @returns {Object} Wallet connection state and methods
 */
const useWallet = () => {
  const [wallet, setWallet] = useState({
    isConnected: false,
    address: "",
    name: "",
    balance: null,
    error: null,
  });

  // Check if Keplr is installed
  const isKeplrAvailable = useCallback(() => {
    return typeof window.keplr !== "undefined";
  }, []);

  // Connect to Keplr wallet
  const connectWallet = useCallback(async () => {
    try {
      if (!isKeplrAvailable()) {
        throw new Error("Keplr wallet extension is not installed");
      }

      // Enable the Secret Network chain in Keplr
      await window.keplr.enable("secret-4");

      // Get the address
      const offlineSigner = window.keplr.getOfflineSigner("secret-4");
      const accounts = await offlineSigner.getAccounts();
      const address = accounts[0].address;

      // Get the name from Keplr key
      const key = await window.keplr.getKey("secret-4");
      const name = key.name || "Wallet";

      setWallet({
        isConnected: true,
        address,
        name,
        balance: null,
        error: null,
      });

      return { success: true, address };
    } catch (error) {
      setWallet((prev) => ({
        ...prev,
        isConnected: false,
        error: error.message,
      }));

      return { success: false, error: error.message };
    }
  }, [isKeplrAvailable]);

  // Disconnect wallet
  const disconnectWallet = useCallback(() => {
    setWallet({
      isConnected: false,
      address: "",
      name: "",
      balance: null,
      error: null,
    });
  }, []);

  // Fetch wallet balance
  const fetchBalance = useCallback(async () => {
    if (!wallet.isConnected || !wallet.address) return;

    try {
      // Here you would connect to the blockchain and fetch the balance
      // This is a placeholder for the actual implementation
      const balance = { amount: "0", denom: "uscrt" };

      setWallet((prev) => ({
        ...prev,
        balance,
        error: null,
      }));

      return balance;
    } catch (error) {
      setWallet((prev) => ({
        ...prev,
        error: `Failed to fetch balance: ${error.message}`,
      }));
      return null;
    }
  }, [wallet.isConnected, wallet.address]);

  // Auto-connect on component mount
  useEffect(() => {
    const autoConnect = async () => {
      // Check if the user was previously connected
      if (localStorage.getItem("walletConnected") === "true") {
        await connectWallet();
      }
    };

    autoConnect();
  }, [connectWallet]);

  // Save connection state to localStorage
  useEffect(() => {
    if (wallet.isConnected) {
      localStorage.setItem("walletConnected", "true");
    } else {
      localStorage.removeItem("walletConnected");
    }
  }, [wallet.isConnected]);

  return {
    wallet,
    connectWallet,
    disconnectWallet,
    fetchBalance,
    isKeplrAvailable,
  };
};

export default useWallet;
