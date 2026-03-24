import React from "react";
import Sidebar from "./Sidebar";
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
  const { walletName, isKeplrConnected, isLoggingIn, isConnecting, loginError, isRegistryLoaded, handleLogin, handleLogout } = useWallet();
  const { isLoading } = useLoading();
  const isMobile = useIsMobile();

  if (!isRegistryLoaded) {
    return (
      <div className="layout-loading">
        <OrbitLoader />
      </div>
    );
  }

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
