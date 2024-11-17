import React, { useState } from 'react';
import Sidebar from './Sidebar.js';
import { connectKeplr } from '../utils/contractUtils';

import './Layout.css';

const Layout = ({ children }) => {
  const [walletName, setWalletName] = useState('');
  const [isKeplrConnected, setKeplrConnected] = useState(false);

  const handleConnectKeplr = async () => {
    try {
      const { secretjs, walletName } = await connectKeplr();
      window.secretjs = secretjs;
      setWalletName(walletName);
      setKeplrConnected(true);
      console.log("Keplr connected");
    } catch (error) {
      console.error("Failed to connect to Keplr:", error);
    }
  };

  return (
    <div className="layout">
      <Sidebar
        walletName={walletName}
        isKeplrConnected={isKeplrConnected}
        onConnectKeplr={handleConnectKeplr}
      />
      <div className="home-section">
      <div id="loading-screen" className="loading remove"></div>
        <div className="home-content">
          {isKeplrConnected ? (
            React.cloneElement(children, { isKeplrConnected })
          ) : (
            <div className="connect-keplr-container">
              <h2>Please Connect Keplr to Continue</h2>
              <button onClick={handleConnectKeplr} className="connect-keplr-button">
                Connect
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Layout;
