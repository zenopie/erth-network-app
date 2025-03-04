import React, { useState, useEffect } from "react";
import PropTypes from "prop-types";
import Sidebar from "./Sidebar";
import "./Layout.css";

/**
 * Main layout component that wraps all pages
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components to render in the layout
 */
const Layout = ({ children }) => {
  const [isMobile, setIsMobile] = useState(false);

  // Check if the viewport is mobile
  useEffect(() => {
    const checkIfMobile = () => {
      setIsMobile(window.innerWidth <= 1024);
    };

    checkIfMobile();
    window.addEventListener("resize", checkIfMobile);

    return () => {
      window.removeEventListener("resize", checkIfMobile);
    };
  }, []);

  return (
    <div className={`layout ${isMobile ? "mobile" : ""}`}>
      <Sidebar />
      <main className="main-content">{children}</main>
    </div>
  );
};

Layout.propTypes = {
  children: PropTypes.node.isRequired,
};

export default Layout;
