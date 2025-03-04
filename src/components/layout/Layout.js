import React from "react";
import PropTypes from "prop-types";
import Sidebar from "./Sidebar";
import "./Layout.css";

/**
 * Main layout component that wraps all pages
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render in the layout
 */
const Layout = ({ children }) => {
  return (
    <div className="layout">
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
};

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default Layout;
