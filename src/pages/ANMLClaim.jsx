import { useEffect, useState } from "react";
import styles from "./ANMLClaim.module.css";
import { useLoading } from "../contexts/LoadingContext";
import { poolForToken } from "../chain/dex";
import { UANML, UERTH } from "../chain/config";
import { toMacro } from "../chain/tokens";
import useErthPrice from "../hooks/useErthPrice";
import { formatPrice } from "../utils/formatUtils";
import anmlImage from "../images/anml.png";

const ANMLClaim = () => {
  const { hideLoading } = useLoading();
  const [anmlPrice, setAnmlPrice] = useState(null);
  const erthPrice = useErthPrice();

  // ANML has no external price feed, so it is derived from the on-chain
  // ANML/ERTH pool's spot rate priced in ERTH.
  useEffect(() => {
    hideLoading();
    if (!erthPrice) return;

    poolForToken(UANML)
      .then((pool) => {
        if (!pool) return;
        const erthReserve = toMacro(pool.erthReserve, UERTH);
        const anmlReserve = toMacro(pool.tokenReserve, UANML);
        if (anmlReserve > 0) setAnmlPrice((erthReserve / anmlReserve) * erthPrice);
      })
      .catch(console.error);
  }, [erthPrice]);

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
