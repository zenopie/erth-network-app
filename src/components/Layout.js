import React, { useEffect, useState } from 'react';
import Sidebar from './Sidebar.js';
import { connectKeplr } from '../utils/contractUtils';
import './Layout.css'; // Ensure you import the global and layout-specific styles

const Layout = ({ children }) => {
  const [walletName, setWalletName] = useState('');
  const [isKeplrConnected, setKeplrConnected] = useState(false);

  useEffect(() => {
    const connectWallet = async () => {
      try {
        const { secretjs, walletName } = await connectKeplr();
        window.secretjs = secretjs;
        setWalletName(walletName);
        setKeplrConnected(true);
        console.log("Keplr connected, you can now access SecretJS and other features.");
      } catch (error) {
        console.log("Failed to connect to Keplr:", error);
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
