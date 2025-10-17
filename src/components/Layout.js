import React, { useEffect, useState } from "react";
import Sidebar from "./Sidebar.js";
import Login from "./Login.js";
import { connectKeplr } from "../utils/contractUtils";
import { showLoadingScreen } from "../utils/uiUtils";
import "./Layout.css"; // Ensure you import the global and layout-specific styles

const Layout = ({ children }) => {
  const [walletName, setWalletName] = useState("");
  const [isKeplrConnected, setKeplrConnected] = useState(false);
  const [isRegistryLoaded, setRegistryLoaded] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
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

  // Handle login success
  const handleLoginSuccess = async () => {
    setIsLoggedIn(true);
  };

  // Connect Keplr after login
  useEffect(() => {
    if (!isLoggedIn) return;

    const connectWallet = async (retryCount = 0) => {
      try {
        const { secretjs, walletName } = await connectKeplr();
        window.secretjs = secretjs;
        setWalletName(walletName);
        setKeplrConnected(true);
        setRegistryLoaded(true); // Registry is loaded in connectKeplr
        console.log("Keplr connected and registry loaded, retry count:", retryCount);
      } catch (error) {
        if (retryCount < 5) {
          // Retry up to 5 times
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.log(`Retrying to connect to Keplr in ${delay / 1000} seconds...`);
          setTimeout(() => connectWallet(retryCount + 1), delay);
        } else {
          console.log("Failed to connect to Keplr after multiple attempts:", error);
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

  // Show login screen if not logged in
  if (!isLoggedIn) {
    return <Login onLoginSuccess={handleLoginSuccess} />;
  }

  // Show loading spinner while connecting to Keplr
  if (!isKeplrConnected || !isRegistryLoaded) {
    return (
      <div className="layout-loading">
        <div className="loading-spinner">
          <div className="spinner"></div>
          <h2>Logging in</h2>
        </div>
      </div>
    );
  }

  // Render the main layout
  return (
    <div className={`layout ${isMobile ? "mobile" : ""}`}>
      <Sidebar walletName={walletName} isKeplrConnected={isKeplrConnected} />
      <div className="home-section">
        {/* Loading Screen - for page transitions */}
        <div id="loading-screen" className="loading remove"></div>
        <div className="home-content">{React.cloneElement(children, { isKeplrConnected })}</div>
      </div>
    </div>
  );
};

export default Layout;
