import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './Sidebar.css';
import logo from '../images/logo.png';
import keplr from '../images/keplr.svg';

const Sidebar = ({ walletName, isKeplrConnected }) => {
  const [isGovernanceOpen, setIsGovernanceOpen] = useState(false);
  const [isExperimentsOpen, setIsExperimentsOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  const handleMouseEnter = () => setIsCollapsed(false);
  const handleMouseLeave = () => {
    setIsCollapsed(true);
    setIsGovernanceOpen(false);
    setIsExperimentsOpen(false);
  };

  return (
    <div
      className={`sidebar ${isCollapsed ? 'collapsed' : ''}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="logo-details">
        <img src={logo} alt="Logo" className="logo-img" />
      </div>
      <ul className="nav-links">
        <li>
          <Link to="/anml-claim">
            <i className="bx bxs-coin"></i>
            <span className="link_name">ANML Claim</span>
          </Link>
        </li>
        <li>
          <Link to="/swap-tokens">
            <i className="bx bxs-store-alt"></i>
            <span className="link_name">Swap Tokens</span>
          </Link>
        </li>
        <li>
          <Link to="/manage-lp">
            <i className="bx bxs-droplet-half"></i>
            <span className="link_name">Manage LP</span>
          </Link>
        </li>
        <li>
          <Link to="/stake-erth">
            <i className="bx bxs-bank"></i>
            <span className="link_name">Stake ERTH</span>
          </Link>
        </li>
        <li className={`submenu ${isGovernanceOpen ? 'open' : ''}`}>
          <div
            onClick={() => {
              setIsGovernanceOpen(prev => !prev);
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
              <Link to="/public-goods-fund">Public Benefit Fund</Link>
            </li>
            <li>
              <Link to="/deflation-fund">Deflation Fund</Link>
            </li>
          </ul>
        </li>
        <li>
          <a href="https://dash.scrt.network/" target="_blank" rel="noopener noreferrer">
            <i className="bx bxs-dashboard"></i>
            <span className="link_name">SCRT Dashboard</span>
          </a>
        </li>
        <li>
          <a href="https://app.fina.cash/" target="_blank" rel="noopener noreferrer">
            <i className="bx bx-credit-card"></i>
            <span className="link_name">FINA Card</span>
          </a>
        </li>
        <li className={`submenu ${isExperimentsOpen ? 'open' : ''}`}>
          <div
            onClick={() => {
              setIsExperimentsOpen(prev => !prev);
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
              <Link to="/ai-chat">AI Chat</Link>
            </li>
            <li>
              <Link to="/analytics">Analytics</Link>
            </li>
            <li>
              <Link to="/totp-auth">TOTP Auth</Link>
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
            <div id="wallet-name" className="profile_name">
              {isKeplrConnected ? walletName : 'Connecting...'}
            </div>
            <div className="job"></div>
          </div>
        </div>
        <li className="socials-link">
          <div className="socials-placeholder">
            <i className={`bx ${isCollapsed ? 'bx-heart' : ''}`}></i>
          </div>
          {!isCollapsed && (
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
  );
};

export default Sidebar;
