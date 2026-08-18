import React, { useState, useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import "./Sidebar.css";
import logo from "../images/logo.png";
import SettingsMenu from "./SettingsMenu";
import keplr from "../images/keplr.png";
import useIsMobile from "../hooks/useIsMobile";

const Sidebar = ({ walletName, address, isConnected, isConnecting, connectError, onConnect, onDisconnect }) => {
  const location = useLocation();
  const [isGovernanceOpen, setIsGovernanceOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const isMobile = useIsMobile();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Close mobile menu when switching to desktop
  useEffect(() => {
    if (!isMobile) setIsMobileMenuOpen(false);
  }, [isMobile]);

  const toggleSidebar = () => {
    if (!isMobile) {
      setIsCollapsed((prev) => !prev);
      if (!isCollapsed) {
        setIsGovernanceOpen(false);
      }
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  return (
    <>
      {isMobile && (
        <button className="mobile-menu-toggle" onClick={toggleMobileMenu} aria-label="Toggle navigation menu">
          <i className="bx bx-menu-alt-right"></i>
        </button>
      )}
      <div
        className={`sidebar ${isCollapsed && !isMobile ? "collapsed" : ""} ${isMobile ? "mobile" : ""} ${
          isMobileMenuOpen ? "mobile-open" : ""
        }`}
      >
        {isMobile && (
          <button className="close-mobile-menu" onClick={toggleMobileMenu} aria-label="Close navigation menu">
            <i className="bx bx-x"></i>
          </button>
        )}
        <div className="logo-details">
          <img src={logo} alt="Logo" className="logo-img" />
          {!isMobile && (
            <button className="sidebar-toggle-btn" onClick={toggleSidebar} aria-label="Toggle sidebar">
              <i className={`bx ${isCollapsed ? "bx-chevron-right" : "bx-chevron-left"}`}></i>
            </button>
          )}
        </div>
        <ul className="nav-links">
          <li className={location.pathname === "/swap-tokens" ? "active" : ""}>
            <Link to="/swap-tokens" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
              <i className="bx bxs-store-alt"></i>
              <span className="link_name">Swap Tokens</span>
            </Link>
          </li>
          <li className={location.pathname === "/markets" ? "active" : ""}>
            <Link to="/markets" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
              <i className="bx bxs-bar-chart-square"></i>
              <span className="link_name">Markets</span>
            </Link>
          </li>
          <li className={location.pathname === "/stake-erth" ? "active" : ""}>
            <Link to="/stake-erth" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
              <i className="bx bxs-bank"></i>
              <span className="link_name">Stake ERTH</span>
            </Link>
          </li>
          <li className={location.pathname.startsWith("/explorer") ? "active" : ""}>
            <Link to="/explorer" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
              <i className="bx bxs-cube"></i>
              <span className="link_name">Explorer</span>
            </Link>
          </li>
          <li className={`submenu ${isGovernanceOpen ? "open" : ""}`}>
            <div
              onClick={() => {
                setIsGovernanceOpen((prev) => !prev);
              }}
              className="submenu-toggle"
            >
              <i className="bx bxs-pie-chart-alt-2"></i>
              <span className="link_name">Governance</span>
              <i className="bx bx-chevron-right arrow"></i>
            </div>
            <ul className="submenu-list">
              <li className={location.pathname === "/caretaker-fund" ? "active" : ""}>
                <Link to="/caretaker-fund" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
                  Caretaker Fund
                </Link>
              </li>
              <li className={location.pathname === "/groundworks-fund" ? "active" : ""}>
                <Link to="/groundworks-fund" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
                  Groundworks Fund
                </Link>
              </li>
            </ul>
          </li>
        </ul>

        <div className="profile-container">
          {isConnected ? (
            <div className="profile-details">
              <div className="profile-content">
                <img src={keplr} alt="Keplr" />
              </div>
              <div className="name-job">
                <div className="profile-name-row">
                  <div id="wallet-name" className="profile_name">
                    {walletName}
                  </div>
                </div>
                <div className="wallet-address">
                  {address ? `${address.slice(0, 10)}...${address.slice(-4)}` : ""}
                </div>
              </div>
              <SettingsMenu onDisconnect={onDisconnect} showDisconnect />
            </div>
          ) : (
            <div
              className={`profile-details sidebar-login-area ${isConnecting ? "disabled" : ""}`}
              onClick={!isConnecting ? onConnect : undefined}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !isConnecting) onConnect();
              }}
            >
              <div className="profile-content">
                {isConnecting ? (
                  <div className="sidebar-connect-spinner"></div>
                ) : (
                  <img src={keplr} alt="Keplr" />
                )}
              </div>
              <div className="name-job">
                <div className="profile_name sidebar-login-text">
                  {isConnecting ? "Connecting..." : "Connect Wallet"}
                </div>
                {connectError && (
                  <div className="sidebar-login-error">{connectError}</div>
                )}
              </div>
            </div>
          )}
          <li className="socials-link">
            {isCollapsed && !isMobile && (
              <div className="socials-placeholder">
                <i className="bx bx-heart"></i>
              </div>
            )}
            {(!isCollapsed || (isMobile && isMobileMenuOpen)) && (
              <div className="expanded-socials">
                <a href="https://discord.gg/uNKar4EbCZ" target="_blank" rel="noopener noreferrer" aria-label="Discord">
                  <i className="bx bxl-discord-alt"></i>
                </a>
                <a href="https://t.me/earth_network" target="_blank" rel="noopener noreferrer" aria-label="Telegram">
                  <i className="bx bxl-telegram"></i>
                </a>
                <a href="https://github.com/zenopie" target="_blank" rel="noopener noreferrer" aria-label="GitHub">
                  <i className="bx bxl-github"></i>
                </a>
              </div>
            )}
          </li>
        </div>
      </div>
    </>
  );
};

export default Sidebar;
