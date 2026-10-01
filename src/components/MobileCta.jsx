import React from "react";
import styles from "./MobileCta.module.css";
import { MOBILE_APP_URL } from "../chain/config";

/**
 * Points a private action at the mobile app.
 *
 * Everything a registered human or a private staker does is authorised by a
 * zero-knowledge proof over notes and identity leaves only their phone holds.
 * The web app has no prover in v1, so it shows the public result and sends
 * people here for the act itself.
 */
const MobileCta = ({ title = "Do this in the Earth Wallet app", children }) => (
  <div className={styles.cta}>
    <i className={`bx bx-mobile-alt ${styles.icon}`} aria-hidden="true"></i>
    <div className={styles.body}>
      <div className={styles.title}>{title}</div>
      {children && <div className={styles.text}>{children}</div>}
    </div>
    <a className={styles.button} href={MOBILE_APP_URL} target="_blank" rel="noopener noreferrer">
      Get the app
    </a>
  </div>
);

export default MobileCta;
