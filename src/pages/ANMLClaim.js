import React, { useEffect } from "react";
import styles from "./ANMLClaim.module.css";
import { showLoadingScreen } from "../utils/uiUtils";
import anmlImage from "../images/anml.png";


const ANMLClaim = ({ isKeplrConnected }) => {

  const showMobileAppMessage = () => {
    // Always show the mobile app download message - no loading needed
    showLoadingScreen(false); // Ensure loading screen is hidden
  };

  useEffect(() => {
    // Always show the mobile app download message immediately
    showMobileAppMessage();
  }, []);

  return (
    <div className={styles.testBox}>
      <img
        src={anmlImage}
        alt="ANML"
        className={styles.logoImg}
      />
      <div className={styles.disabledMessage}>
        Please download the mobile app to register and claim ANML!
      </div>
      <button
        className={styles.googlePlayButton}
        onClick={() => window.open('https://play.google.com/store/apps/details?id=network.erth.wallet', '_blank')}
      >
        <i className="bx bxl-play-store"></i>
        <span>Get it on Google Play</span>
      </button>
    </div>
  );
};

export default ANMLClaim;