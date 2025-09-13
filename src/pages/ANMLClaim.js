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
        Please download the mobile app to register and claim ANML, coming soon!
      </div>
      <div className={styles.googlePlayContainer}>
        <img 
          src="https://upload.wikimedia.org/wikipedia/commons/7/78/Google_Play_Store_badge_EN.svg" 
          alt="Get it on Google Play" 
          onClick={() => window.open('#', '_blank')}
        />
      </div>
    </div>
  );
};

export default ANMLClaim;