import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./Sidebar.css";
import logo from "../images/logo.png";
import keplr from "../images/keplr.png";

const Sidebar = ({ walletName, isKeplrConnected, isLoggingIn, isConnecting, loginError, onLogin, onLogout }) => {
  const [isGovernanceOpen, setIsGovernanceOpen] = useState(false);
  const [isUtilitiesOpen, setIsUtilitiesOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Check if the viewport is mobile
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth <= 1024);
      // If switching to desktop view, ensure sidebar state is appropriate
      if (window.innerWidth > 1024) {
        setIsMobileMenuOpen(false);
      }
    };

    checkIfMobile();
    window.addEventListener("resize", checkIfMobile);

    return () => {
      window.removeEventListener("resize", checkIfMobile);
    };
  }, []);

  const toggleSidebar = () => {
    if (!isMobile) {
      setIsCollapsed((prev) => !prev);
      if (!isCollapsed) {
        setIsGovernanceOpen(false);
        setIsUtilitiesOpen(false);
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
          <li>
            <Link to="/anml-claim" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
              <i className="bx bxs-coin"></i>
              <span className="link_name">ANML Claim</span>
            </Link>
          </li>
          <li>
            <Link to="/swap-tokens" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
              <i className="bx bxs-store-alt"></i>
              <span className="link_name">Swap Tokens</span>
            </Link>
          </li>
          <li>
            <Link to="/markets" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
              <i className="bx bxs-bar-chart-square"></i>
              <span className="link_name">Markets</span>
            </Link>
          </li>
          <li>
            <Link to="/stake-erth" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
              <i className="bx bxs-bank"></i>
              <span className="link_name">Stake ERTH</span>
            </Link>
          </li>
          <li className={`submenu ${isGovernanceOpen ? "open" : ""}`}>
            <div
              onClick={() => {
                setIsGovernanceOpen((prev) => !prev);
                setIsUtilitiesOpen(false);
              }}
              className="submenu-toggle"
            >
              <i className="bx bxs-pie-chart-alt-2"></i>
              <span className="link_name">Governance</span>
              <i className="bx bx-chevron-right arrow"></i>
            </div>
            <ul className="submenu-list">
              <li>
                <Link to="/public-benefit-fund" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
                  Caretaker Fund
                </Link>
              </li>
              <li>
                <Link to="/deflation-fund" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
                  Deflation Fund
                </Link>
              </li>
            </ul>
          </li>
          <li>
            <Link to="/airdrop" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
              <i className="bx bxs-gift"></i>
              <span className="link_name">Weekly{'\u00A0'}Airdrop</span>
            </Link>
          </li>
          <li className={`submenu ${isUtilitiesOpen ? "open" : ""}`}>
            <div
              onClick={() => {
                setIsUtilitiesOpen((prev) => !prev);
                setIsGovernanceOpen(false);
              }}
              className="submenu-toggle"
            >
              <i className="bx bxs-cog"></i>
              <span className="link_name">Utilities</span>
              <i className="bx bx-chevron-right arrow"></i>
            </div>
            <ul className="submenu-list">
              <li>
                <Link to="/bridge" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
                  XMR Bridge
                </Link>
              </li>
              <li>
                <Link to="/transaction-logs" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
                  Transaction Logs
                </Link>
              </li>
            </ul>
          </li>
        </ul>

        <div className="profile-container">
          {isKeplrConnected ? (
            <div className="profile-details">
              <div className="profile-content">
                <img src={keplr} alt="Keplr" />
              </div>
              <div className="name-job">
                <div className="profile-name-row">
                  <div id="wallet-name" className="profile_name">
                    {walletName}
                  </div>
                  <button
                    className="logout-button"
                    onClick={onLogout}
                    title="Logout"
                  >
                    <i className="bx bx-log-out"></i>
                  </button>
                </div>
                <div className="job"></div>
              </div>
            </div>
          ) : (
            <div
              className={`profile-details sidebar-login-area ${isLoggingIn || isConnecting ? "disabled" : ""}`}
              onClick={!(isLoggingIn || isConnecting) ? onLogin : undefined}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !(isLoggingIn || isConnecting)) onLogin();
              }}
            >
              <div className="profile-content">
                {isLoggingIn || isConnecting ? (
                  <div className="sidebar-connect-spinner"></div>
                ) : (
                  <img src={keplr} alt="Keplr" />
                )}
              </div>
              <div className="name-job">
                <div className="profile_name sidebar-login-text">
                  {isLoggingIn ? "Signing..." : isConnecting ? "Connecting..." : "Sign In"}
                </div>
                {loginError && (
                  <div className="sidebar-login-error">{loginError}</div>
                )}
              </div>
            </div>
          )}
          <li className="socials-link">
            <div className="socials-placeholder">
              <i className={`bx ${isCollapsed && !isMobile ? "bx-heart" : ""}`}></i>
            </div>
            {(!isCollapsed || (isMobile && isMobileMenuOpen)) && (
              <div className="expanded-socials">
                <a href="https://discord.gg/uNKar4EbCZ" target="_blank" rel="noopener noreferrer">
                  <i className="bx bxl-discord-alt"></i>
                </a>
                <a href="https://github.com/zenopie" target="_blank" rel="noopener noreferrer">
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
