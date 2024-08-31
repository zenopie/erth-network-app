import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import './Sidebar.css';
import logo from '../images/logo.png';
import keplr from '../images/keplr.svg';

const Sidebar = ({ walletName, isKeplrConnected }) => {
  const [isSubmenuOpen, setIsSubmenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(true);

  const toggleSubmenu = () => {
    setIsSubmenuOpen(!isSubmenuOpen);
  };

  const handleMouseEnter = () => {
    setIsCollapsed(false);
  };

  const handleMouseLeave = () => {
    setIsCollapsed(true);
    setIsSubmenuOpen(false); // Close the submenu when sidebar collapses
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
            <i className='bx bxs-coin'></i>
            <span className="link_name">ANML&nbsp;Claim</span>
          </Link>
        </li>
        <li>
          <Link to="/swap-tokens">
            <i className='bx bxs-store-alt'></i>
            <span className="link_name">Swap&nbsp;Tokens</span>
          </Link>
        </li>
        <li>
          <Link to="/manage-lp">
            <i className='bx bxs-droplet-half'></i>
            <span className="link_name">Manage&nbsp;LP</span>
          </Link>
        </li>
        <li>
          <Link to="/stake-erth">
            <i className='bx bxs-bank'></i>
            <span className="link_name">Stake&nbsp;ERTH</span>
          </Link>
        </li>
        <li className={isSubmenuOpen ? "submenu open" : "submenu"}>
          <div onClick={toggleSubmenu} className="submenu-toggle">
            <i className='bx bxs-pie-chart-alt-2'></i>
            <span className="link_name">Governance</span>
            <i className='bx bx-chevron-right arrow'></i>
          </div>
          <ul className={isSubmenuOpen ? "submenu-list" : "submenu-list remove"}>
            <li>
              <Link to="/deflation-fund">Deflation Fund</Link>
            </li>
            <li>
              <a href="publicGoods.html">Public Goods Fund</a>
            </li>
          </ul>
        </li>
        <li>
          <div className="profile-details">
            <div className="profile-content">
              <img src={keplr} alt="profileImg" />
            </div>
            <div className="name-job">
              <div id="wallet-name" className="profile_name">
                {isKeplrConnected ? walletName : "Connecting..."}
              </div>
              <div className="job"></div>
            </div>
          </div>
        </li>
      </ul>
    </div>
  );
};

export default Sidebar;
