import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar.js';
import { connectKeplr } from '../utils/contractUtils';
import './Layout.css'; // Ensure you import the global and layout-specific styles

const Layout = ({ children }) => {
  const [walletName, setWalletName] = useState('');
  const [isKeplrConnected, setKeplrConnected] = useState(false);

  useEffect(() => {
    const connectWallet = async (retryCount = 0) => {
      try {
        const { secretjs, walletName } = await connectKeplr();
        window.secretjs = secretjs;
        setWalletName(walletName);
        setKeplrConnected(true);
        console.log("Keplr connected, retry count:", retryCount);
      } catch (error) {
        if (retryCount < 5) { // Retry up to 5 times
          const delay = Math.pow(2, retryCount) * 1000; // Exponential backoff
          console.log(`Retrying to connect to Keplr in ${delay / 1000} seconds...`);
          setTimeout(() => connectWallet(retryCount + 1), delay);
        } else {
          console.log("Failed to connect to Keplr after multiple attempts:", error);
        }
      }
    };

    connectWallet();
  }, []);

  return (
    <div className="layout">
      <Sidebar walletName={walletName} isKeplrConnected={isKeplrConnected} />
      <div className="home-section">
        {/* Loading Screen */}
        <div id="loading-screen" className="loading"></div>
        <div className="home-content">
          {React.cloneElement(children, { isKeplrConnected })}
        </div>
      </div>
    </div>
  );
};

export default Layout;

