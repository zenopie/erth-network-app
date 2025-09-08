import React, { useEffect, useState } from "react";
import Sidebar from "./Sidebar.js";
import { connectKeplr } from "../utils/contractUtils";
import "./Layout.css"; // Ensure you import the global and layout-specific styles

const Layout = ({ children }) => {
  const [walletName, setWalletName] = useState("");
  const [isKeplrConnected, setKeplrConnected] = useState(false);
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

  useEffect(() => {
    const connectWallet = async (retryCount = 0) => {
      try {
        const { secretjs, walletName } = await connectKeplr();
        window.secretjs = secretjs;
        setWalletName(walletName);
        setKeplrConnected(true);
        console.log("Keplr connected, retry count:", retryCount);
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

    // Listen for Keplr account changes and hard refresh the app
    const handleAccountChange = () => {
      console.log("Keplr account changed, refreshing app...");
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
  }, []);

  return (
    <div className={`layout ${isMobile ? "mobile" : ""}`}>
      <Sidebar walletName={walletName} isKeplrConnected={isKeplrConnected} />
      <div className="home-section">
        {/* Loading Screen */}
        <div id="loading-screen" className="loading"></div>
        <div className="home-content">{React.cloneElement(children, { isKeplrConnected })}</div>
      </div>
    </div>
  );
};

export default Layout;
