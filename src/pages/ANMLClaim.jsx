import { useEffect, useState } from "react";
import styles from "./ANMLClaim.module.css";
import { useLoading } from "../contexts/LoadingContext";
import { ERTH_API_BASE_URL } from "../utils/config";
import { formatPrice } from "../utils/formatUtils";
import anmlImage from "../images/anml.png";

const ANMLClaim = () => {
  const { hideLoading } = useLoading();
  const [anmlPrice, setAnmlPrice] = useState(null);

  useEffect(() => {
    hideLoading();

    fetch(`${ERTH_API_BASE_URL}/analytics`)
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (data?.latest?.anmlPrice) setAnmlPrice(data.latest.anmlPrice);
      })
      .catch(console.error);
  }, []);

  return (
    <div className={styles.container}>
      <div className={styles.card}>
        <img src={anmlImage} alt="ANML" className={styles.logoImg} />
        <h1 className={styles.title}>One ANML per day</h1>
        {anmlPrice && <span className={styles.price}>{formatPrice(anmlPrice)}</span>}
        <p className={styles.message}>
          Download the mobile app to register and claim
        </p>
        <button
          className={styles.googlePlayButton}
          onClick={() => window.open('https://play.google.com/store/apps/details?id=network.erth.wallet', '_blank')}
        >
          <i className="bx bxl-play-store"></i>
          <span>Get it on Google Play</span>
        </button>
      </div>
    </div>
  );
};

export default ANMLClaim;
