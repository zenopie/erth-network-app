import React, { createContext, useContext, useEffect, useState } from "react";
import { connectKeplr, queryRegistryAndGetTokens, ensureRegistryLoaded, clearLoginPermit } from "../utils/contractUtils";
import contracts from "../utils/contracts";
import tokens from "../utils/tokens";

const WalletContext = createContext(null);

export const useWallet = () => {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used within WalletProvider");
  return ctx;
};

export const WalletProvider = ({ children }) => {
  const [walletName, setWalletName] = useState("");
  const [isKeplrConnected, setKeplrConnected] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isRegistryLoaded, setRegistryLoaded] = useState(!!contracts.exchange?.contract);

  // Load registry on mount
  useEffect(() => {
    if (!isRegistryLoaded) {
      ensureRegistryLoaded().then((loaded) => setRegistryLoaded(loaded));
    }
  }, [isRegistryLoaded]);

  // Check for existing login on mount
  useEffect(() => {
    const checkExistingLogin = async () => {
      const existingPermit = localStorage.getItem('erth_login_permit');
      const storedAddress = localStorage.getItem('erth_user_address');
      const permitExpiration = localStorage.getItem('erth_permit_expiration');

      if (existingPermit && storedAddress && permitExpiration) {
        const currentTime = Math.floor(Date.now() / 1000);
        const expirationTime = parseInt(permitExpiration, 10);

        if (currentTime >= expirationTime) {
          clearLoginPermit();
          return;
        }

        try {
          if (window.keplr) {
            const chainId = 'secret-4';
            await window.keplr.enable(chainId);
            const offlineSigner = window.getOfflineSignerOnlyAmino(chainId);
            const accounts = await offlineSigner.getAccounts();

            if (accounts && accounts.length > 0) {
              const currentAddress = accounts[0].address;
              if (currentAddress === storedAddress) {
                setIsLoggedIn(true);
              } else {
                clearLoginPermit();
              }
            }
          }
        } catch (err) {
          console.log("Could not verify existing login:", err);
        }
      }
    };

    checkExistingLogin();
  }, []);

  // Connect Keplr after login
  useEffect(() => {
    if (!isLoggedIn) return;

    setIsConnecting(true);

    const connectWallet = async (retryCount = 0) => {
      try {
        const { secretjs, walletName } = await connectKeplr();
        window.secretjs = secretjs;
        setWalletName(walletName);
        setKeplrConnected(true);
        setIsConnecting(false);
      } catch (error) {
        if (retryCount < 5) {
          const delay = Math.pow(2, retryCount) * 1000;
          setTimeout(() => connectWallet(retryCount + 1), delay);
        } else {
          setIsConnecting(false);
          setLoginError("Failed to connect wallet. Please try again.");
        }
      }
    };

    const handleAccountChange = () => {
      clearLoginPermit();
      window.location.reload();
    };

    connectWallet();

    if (window.keplr) {
      window.addEventListener("keplr_keystorechange", handleAccountChange);
    }

    return () => {
      if (window.keplr) {
        window.removeEventListener("keplr_keystorechange", handleAccountChange);
      }
    };
  }, [isLoggedIn]);

  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError("");

    try {
      if (!window.keplr) throw new Error("Please install Keplr extension");

      const chainId = 'secret-4';
      await window.keplr.enable(chainId);

      const offlineSigner = window.getOfflineSignerOnlyAmino(chainId);
      const accounts = await offlineSigner.getAccounts();
      if (!accounts || accounts.length === 0) throw new Error("No accounts found in Keplr");

      const userAddress = accounts[0].address;
      const tokenAddresses = await queryRegistryAndGetTokens();

      if (tokens.XMR?.contract && !tokenAddresses.includes(tokens.XMR.contract)) {
        tokenAddresses.push(tokens.XMR.contract);
      }

      const oneWeekInSeconds = 7 * 24 * 60 * 60;
      const expirationTimestamp = Math.floor(Date.now() / 1000) + oneWeekInSeconds;

      const permit = {
        chain_id: chainId,
        account_number: "0",
        sequence: "0",
        msgs: [{
          type: "query_permit",
          value: {
            permit_name: "erth_network_login",
            allowed_tokens: tokenAddresses,
            permissions: ["owner"]
          }
        }],
        fee: { amount: [{ denom: "uscrt", amount: "0" }], gas: "1" },
        memo: ""
      };

      const signedPermit = await window.keplr.signAmino(chainId, userAddress, permit, {
        preferNoSetFee: true,
        preferNoSetMemo: true
      });

      clearLoginPermit();

      const permitData = {
        params: {
          permit_name: "erth_network_login",
          allowed_tokens: tokenAddresses,
          chain_id: chainId,
          permissions: ["owner"]
        },
        signature: signedPermit.signature
      };

      localStorage.setItem('erth_login_permit', JSON.stringify(permitData));
      localStorage.setItem('erth_user_address', userAddress);
      localStorage.setItem('erth_permit_expiration', expirationTimestamp.toString());

      setIsLoggedIn(true);
    } catch (err) {
      console.error('Login error:', err);
      setLoginError(err.message || 'Failed to login. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogout = () => {
    clearLoginPermit();
    localStorage.removeItem('contractRegistry');
    window.location.reload();
  };

  return (
    <WalletContext.Provider value={{
      walletName,
      isKeplrConnected,
      isLoggingIn,
      isConnecting,
      loginError,
      isRegistryLoaded,
      handleLogin,
      handleLogout,
    }}>
      {children}
    </WalletContext.Provider>
  );
};

export default WalletContext;
