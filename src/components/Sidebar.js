import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import "./Sidebar.css";
import logo from "../images/logo.png";
import keplr from "../images/keplr.png";

const Sidebar = ({ walletName, isKeplrConnected }) => {
  const [isGovernanceOpen, setIsGovernanceOpen] = useState(false);
  const [isExperimentsOpen, setIsExperimentsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);
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

  const handleMouseEnter = () => !isMobile && setIsCollapsed(false);
  const handleMouseLeave = () => {
    if (!isMobile) {
      setIsCollapsed(true);
      setIsGovernanceOpen(false);
      setIsExperimentsOpen(false);
    }
  };

  const toggleMobileMenu = () => {
    setIsMobileMenuOpen(!isMobileMenuOpen);
  };

  const handleLogout = () => {
    // Clear all login data
    localStorage.removeItem('erth_login_permit');
    localStorage.removeItem('erth_user_address');
    localStorage.removeItem('erth_permit_expiration');
    // Reload to show login screen
    window.location.reload();
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
        onMouseEnter={handleMouseEnter}
        onMouseLeave={handleMouseLeave}
      >
        {isMobile && (
          <button className="close-mobile-menu" onClick={toggleMobileMenu} aria-label="Close navigation menu">
            <i className="bx bx-x"></i>
          </button>
        )}
        <div className="logo-details">
          <img src={logo} alt="Logo" className="logo-img" />
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
            <Link to="/manage-lp" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
              <i className="bx bxs-droplet-half"></i>
              <span className="link_name">Manage LP</span>
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
                setIsExperimentsOpen(false);
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
            <Link to="/gas-station" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
              <i className="bx bxs-gas-pump"></i>
              <span className="link_name">Gas Station</span>
            </Link>
          </li>
          <li>
            <Link to="/airdrop" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
              <i className="bx bxs-gift"></i>
              <span className="link_name">Weekly{'\u00A0'}Airdrop</span>
            </Link>
          </li>
          <li className={`submenu ${isExperimentsOpen ? "open" : ""}`}>
            <div
              onClick={() => {
                setIsExperimentsOpen((prev) => !prev);
                setIsGovernanceOpen(false);
              }}
              className="submenu-toggle"
            >
              <i className="bx bx-test-tube"></i>
              <span className="link_name">Experiments</span>
              <i className="bx bx-chevron-right arrow"></i>
            </div>
            <ul className="submenu-list">
              <li>
                <Link to="/aqua-chat" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
                  Ask Aqua
                </Link>
              </li>
              <li>
                <Link to="/analytics" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
                  Analytics
                </Link>
              </li>
              <li>
                <Link to="/transaction-logs" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
                  Transaction Logs
                </Link>
              </li>
              <li>
                <Link to="/pdf-signature" onClick={() => isMobile && setIsMobileMenuOpen(false)}>
                  PDF Signature
                </Link>
              </li>

            </ul>
          </li>
        </ul>

        <div className="profile-container">
          <div className="profile-details">
            <div className="profile-content">
              <img src={keplr} alt="profileImg" />
            </div>
            <div className="name-job">
              <div className="profile-name-row">
                <div id="wallet-name" className="profile_name">
                  {isKeplrConnected ? walletName : "Connecting..."}
                </div>
                {isKeplrConnected && (
                  <button
                    className="logout-button"
                    onClick={handleLogout}
                    title="Logout"
                  >
                    <i className="bx bx-log-out"></i>
                  </button>
                )}
              </div>
              <div className="job"></div>
            </div>
          </div>
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
