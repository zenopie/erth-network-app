import React from "react";
import Sidebar from "./Sidebar";
import CurrencyToggle from "./CurrencyToggle";
import { useWallet } from "../contexts/WalletContext";
import { useLoading } from "../contexts/LoadingContext";
import useIsMobile from "../hooks/useIsMobile";
import "./Layout.css";

const OrbitLoader = () => (
  <div className="orbit-loader">
    <div className="orbit-track" />
    <img src="/images/coin/ERTH.png" alt="ERTH" className="orbit-loader-erth" />
    <div className="orbit-path">
      <img src="/images/coin/ANML.png" alt="ANML" className="orbit-loader-anml" />
    </div>
  </div>
);

const Layout = ({ children }) => {
  const { address, walletName, isConnected, isConnecting, connectError, connect, disconnect } =
    useWallet();
  const { isLoading } = useLoading();
  const isMobile = useIsMobile();

  // No registry to wait for: earth state is public, so pages render immediately.
  return (
    <div className={`layout ${isMobile ? "mobile" : ""}`}>
      <Sidebar
        walletName={walletName}
        address={address}
        isConnected={isConnected}
        isConnecting={isConnecting}
        connectError={connectError}
        onConnect={connect}
        onDisconnect={disconnect}
      />
      <div className="home-section">
        <CurrencyToggle />
        {isLoading && (
          <div id="loading-screen" className="loading">
            <OrbitLoader />
          </div>
        )}
        <div className="home-content">{children}</div>
      </div>
    </div>
  );
};

export default Layout;
