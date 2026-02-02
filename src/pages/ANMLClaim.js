import { useEffect } from "react";
import styles from "./ANMLClaim.module.css";
import { showLoadingScreen } from "../utils/uiUtils";
import anmlImage from "../images/anml.png";


const ANMLClaim = () => {

  const showMobileAppMessage = () => {
    // Always show the mobile app download message - no loading needed
    showLoadingScreen(false); // Ensure loading screen is hidden
  };

  useEffect(() => {
    // Always show the mobile app download message immediately
    showMobileAppMessage();
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <img
          src={anmlImage}
          alt="ANML"
          className={styles.logoImg}
        />
        <h1 className={styles.title}>Claim ANML</h1>
        <p className={styles.message}>
          Download the Earth Network mobile app to register your identity and claim your daily ANML tokens.
        </p>
        <button
          className={styles.googlePlayButton}
          onClick={() => window.open('https://play.google.com/store/apps/details?id=network.erth.wallet', '_blank')}
        >
          <i className="bx bxl-play-store"></i>
          <span>Get it on Google Play</span>
        </button>
        <div className={styles.features}>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>
              <i className="bx bx-user-check"></i>
            </span>
            <span>Register your unique identity</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>
              <i className="bx bx-coin-stack"></i>
            </span>
            <span>Claim 1 ANML per day</span>
          </div>
          <div className={styles.feature}>
            <span className={styles.featureIcon}>
              <i className="bx bx-shield-quarter"></i>
            </span>
            <span>Passport cryptographic signature secured</span>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ANMLClaim;
