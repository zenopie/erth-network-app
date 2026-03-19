import React, { useEffect, useState } from "react";
import Sidebar from "./Sidebar.js";
import { connectKeplr, queryRegistryAndGetTokens, ensureRegistryLoaded } from "../utils/contractUtils";
import contracts from "../utils/contracts";
import tokens from "../utils/tokens";
import "./Layout.css";

const Layout = ({ children }) => {
  const [walletName, setWalletName] = useState("");
  const [isKeplrConnected, setKeplrConnected] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [loginError, setLoginError] = useState("");
  const [isRegistryLoaded, setRegistryLoaded] = useState(!!contracts.exchange?.contract);
  const [isMobile, setIsMobile] = useState(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth <= 1024);
    };

    checkIfMobile();
    window.addEventListener("resize", checkIfMobile);

    return () => {
      window.removeEventListener("resize", checkIfMobile);
    };
  }, []);

  // Load registry on mount (enables public queries without login)
  useEffect(() => {
    if (!isRegistryLoaded) {
      ensureRegistryLoaded().then((loaded) => setRegistryLoaded(loaded));
    }
  }, [isRegistryLoaded]);

  // Check for existing login on mount and verify wallet matches
  useEffect(() => {
    const checkExistingLogin = async () => {
      const existingPermit = localStorage.getItem('erth_login_permit');
      const storedAddress = localStorage.getItem('erth_user_address');
      const permitExpiration = localStorage.getItem('erth_permit_expiration');

      if (existingPermit && storedAddress && permitExpiration) {
        // Check if permit has expired
        const currentTime = Math.floor(Date.now() / 1000);
        const expirationTime = parseInt(permitExpiration, 10);

        if (currentTime >= expirationTime) {
          console.log("Permit expired, clearing login");
          localStorage.removeItem('erth_login_permit');
          localStorage.removeItem('erth_user_address');
          localStorage.removeItem('erth_permit_expiration');
          return;
        }

        // Verify the current Keplr wallet matches the stored permit
        try {
          if (window.keplr) {
            const chainId = 'secret-4';
            await window.keplr.enable(chainId);
            const offlineSigner = window.getOfflineSignerOnlyAmino(chainId);
            const accounts = await offlineSigner.getAccounts();

            if (accounts && accounts.length > 0) {
              const currentAddress = accounts[0].address;

              if (currentAddress === storedAddress) {
                // Wallet matches and permit not expired, use existing permit
                setIsLoggedIn(true);
              } else {
                // Wallet changed, clear old permit
                console.log("Wallet changed, clearing old permit");
                localStorage.removeItem('erth_login_permit');
                localStorage.removeItem('erth_user_address');
                localStorage.removeItem('erth_permit_expiration');
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
        console.log("Keplr connected and registry loaded, retry count:", retryCount);
      } catch (error) {
        if (retryCount < 5) {
          // Retry up to 5 times
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.log(`Retrying to connect to Keplr in ${delay / 1000} seconds...`);
          setTimeout(() => connectWallet(retryCount + 1), delay);
        } else {
          console.log("Failed to connect to Keplr after multiple attempts:", error);
          setIsConnecting(false);
          setLoginError("Failed to connect wallet. Please try again.");
        }
      }
    };

    // Listen for Keplr account changes and clear permit
    const handleAccountChange = () => {
      console.log("Keplr account changed, clearing permit and refreshing...");
      localStorage.removeItem('erth_login_permit');
      localStorage.removeItem('erth_user_address');
      localStorage.removeItem('erth_permit_expiration');
      window.location.reload();
    };

    connectWallet();

    // Add Keplr account change listener
    if (window.keplr) {
      window.addEventListener("keplr_keystorechange", handleAccountChange);
    }

    return () => {
      if (window.keplr) {
        window.removeEventListener("keplr_keystorechange", handleAccountChange);
      }
    };
  }, [isLoggedIn]);

  // Handle login - sign permit via Keplr
  const handleLogin = async () => {
    setIsLoggingIn(true);
    setLoginError("");

    try {
      if (!window.keplr) {
        throw new Error("Please install Keplr extension");
      }

      const chainId = 'secret-4';

      await window.keplr.enable(chainId);

      const offlineSigner = window.getOfflineSignerOnlyAmino(chainId);
      const accounts = await offlineSigner.getAccounts();

      if (!accounts || accounts.length === 0) {
        throw new Error("No accounts found in Keplr");
      }

      const userAddress = accounts[0].address;

      // Query registry and get token addresses for permit
      const tokenAddresses = await queryRegistryAndGetTokens();

      // Add XMR token address if not already included
      if (tokens.XMR?.contract && !tokenAddresses.includes(tokens.XMR.contract)) {
        tokenAddresses.push(tokens.XMR.contract);
      }

      // Calculate expiration: 1 week from now (in seconds)
      const oneWeekInSeconds = 7 * 24 * 60 * 60;
      const expirationTimestamp = Math.floor(Date.now() / 1000) + oneWeekInSeconds;

      // Create permit for signing
      const permit = {
        chain_id: chainId,
        account_number: "0",
        sequence: "0",
        msgs: [
          {
            type: "query_permit",
            value: {
              permit_name: "erth_network_login",
              allowed_tokens: tokenAddresses,
              permissions: ["owner"]
            }
          }
        ],
        fee: {
          amount: [{ denom: "uscrt", amount: "0" }],
          gas: "1"
        },
        memo: ""
      };

      console.log("Requesting permit signature...");

      const signedPermit = await window.keplr.signAmino(
        chainId,
        userAddress,
        permit,
        {
          preferNoSetFee: true,
          preferNoSetMemo: true
        }
      );

      // Clear any existing permit first
      localStorage.removeItem('erth_login_permit');
      localStorage.removeItem('erth_user_address');
      localStorage.removeItem('erth_permit_expiration');

      const permitData = {
        params: {
          permit_name: "erth_network_login",
          allowed_tokens: tokenAddresses,
          chain_id: chainId,
          permissions: ["owner"]
        },
        signature: signedPermit.signature
      };

      // Store new permit, address, and expiration
      localStorage.setItem('erth_login_permit', JSON.stringify(permitData));
      localStorage.setItem('erth_user_address', userAddress);
      localStorage.setItem('erth_permit_expiration', expirationTimestamp.toString());

      console.log("Login permit signed successfully for:", userAddress);

      setIsLoggedIn(true);

    } catch (err) {
      console.error('Login error:', err);
      setLoginError(err.message || 'Failed to login. Please try again.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle logout
  const handleLogout = () => {
    localStorage.removeItem('erth_login_permit');
    localStorage.removeItem('erth_user_address');
    localStorage.removeItem('erth_permit_expiration');
    window.location.reload();
  };

  // Brief loading while registry loads (instant for returning users with cache)
  if (!isRegistryLoaded) {
    return (
      <div className="layout-loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <h2>Loading</h2>
        </div>
      </div>
    );
  }

  // Always render the layout - pages are accessible without login
  return (
    <div className={`layout ${isMobile ? "mobile" : ""}`}>
      <Sidebar
        walletName={walletName}
        isKeplrConnected={isKeplrConnected}
        isLoggingIn={isLoggingIn}
        isConnecting={isConnecting}
        loginError={loginError}
        onLogin={handleLogin}
        onLogout={handleLogout}
      />
      <div className="home-section">
        {/* Loading Screen - for page transitions */}
        <div id="loading-screen" className="loading remove"></div>
        <div className="home-content">{React.cloneElement(children, { isKeplrConnected })}</div>
      </div>
    </div>
  );
};

export default Layout;
