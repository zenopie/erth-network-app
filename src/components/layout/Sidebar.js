import React, { useState } from "react";
import PropTypes from "prop-types";
import { Link } from "react-router-dom";
import "./Sidebar.css";
import logo from "../../images/logo.png";
import keplr from "../../images/keplr.svg";

/**
 * Sidebar navigation component
 * @param {Object} props - Component props
 * @param {string} props.walletName - Name of the connected wallet
 * @param {boolean} props.isKeplrConnected - Whether Keplr wallet is connected
 */
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
      className={`sidebar ${isCollapsed ? "collapsed" : ""}`}
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
            <i className="bx bxs-wallet"></i>
            <span className="link_name">Manage LP</span>
          </Link>
        </li>
        <li>
          <Link to="/stake-erth">
            <i className="bx bx-coin-stack"></i>
            <span className="link_name">Stake ERTH</span>
          </Link>
        </li>
        <li>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setIsGovernanceOpen(!isGovernanceOpen);
            }}
          >
            <i className="bx bxs-factory"></i>
            <span className="link_name">Governance</span>
            <i className={`bx ${isGovernanceOpen ? "bx-chevron-down" : "bx-chevron-right"} arrow`}></i>
          </a>
          <ul className={`sub-menu ${isGovernanceOpen ? "open" : ""}`}>
            <li>
              <Link to="/public-benefit-fund">Public Benefit Fund</Link>
            </li>
            <li>
              <Link to="/deflation-fund">Deflation Fund</Link>
            </li>
          </ul>
        </li>
        <li>
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              setIsExperimentsOpen(!isExperimentsOpen);
            }}
          >
            <i className="bx bx-test-tube"></i>
            <span className="link_name">Experiments</span>
            <i className={`bx ${isExperimentsOpen ? "bx-chevron-down" : "bx-chevron-right"} arrow`}></i>
          </a>
          <ul className={`sub-menu ${isExperimentsOpen ? "open" : ""}`}>
            <li>
              <Link to="/ai-chat">Secret AI Chat</Link>
            </li>
            <li>
              <Link to="/agent-chat">Agent Chat</Link>
            </li>
            <li>
              <Link to="/image-interpret">Image Interpret</Link>
            </li>
          </ul>
        </li>
        <li>
          <Link to="/analytics">
            <i className="bx bx-line-chart"></i>
            <span className="link_name">Analytics</span>
          </Link>
        </li>
        <li>
          <Link to="/totp-auth">
            <i className="bx bx-shield-quarter"></i>
            <span className="link_name">TOTP Auth</span>
          </Link>
        </li>
      </ul>
      <div className="wallet-container">
        <div className="wallet-info">
          {isKeplrConnected ? (
            <>
              <span className="wallet-name">{walletName}</span>
              <span className="wallet-status connected">Connected</span>
            </>
          ) : (
            <>
              <span className="wallet-status">Not Connected</span>
              <button className="connect-wallet-btn">
                <img src={keplr} alt="Keplr" className="keplr-icon" />
                Connect
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

Sidebar.propTypes = {
  walletName: PropTypes.string,
  isKeplrConnected: PropTypes.bool,
};

Sidebar.defaultProps = {
  walletName: "",
  isKeplrConnected: false,
};

export default Sidebar;
