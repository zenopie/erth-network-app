import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Explorer.module.css";
import forms from "./Forms.module.css";
import * as bank from "../chain/bank";
import * as dex from "../chain/dex";
import * as explorer from "../chain/explorer";
import * as personhood from "../chain/personhood";
import * as shielded from "../chain/shielded";
import { UANML, UERTH } from "../chain/config";
import { toMacro } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import MobileCta from "../components/MobileCta";
import Amount from "../components/Amount";
import useErthPrice from "../hooks/useErthPrice";
import { useDisplayCurrency } from "../contexts/DisplayCurrencyContext";

const amountOf = (coins, denom) => coins?.find((c) => c.denom === denom)?.amount ?? "0";
const fmt = (micro, denom) => toMacro(micro ?? 0, denom).toLocaleString(undefined, { maximumFractionDigits: 2 });

/**
 * ANML, the proof-of-personhood coin.
 *
 * Every registered human can claim 1 ANML a day. ANML exists only as shielded
 * notes — a bank send restriction keeps it out of every account but the
 * personhood, shielded, dex and burn modules — so there is no balance to show
 * and no transparent swap: claiming, sending, buying and selling it all happen
 * in the mobile app. What is public is its supply, how much of it sits in the
 * pool, its price on the ERTH pool, and how much the buyback has burned.
 */
const Anml = () => {
  const { hideLoading } = useLoading();
  const [supply, setSupply] = useState(null);
  const [inPool, setInPool] = useState(null);
  const [pool, setPool] = useState(undefined);
  const [burned, setBurned] = useState(null);
  const [humans, setHumans] = useState(null);
  const erthPrice = useErthPrice();
  const { currency } = useDisplayCurrency();
  // ANML is priced in ERTH by its pool; USD needs an ERTH price on top.
  const rate = currency === "USD" ? erthPrice : 1;

  useEffect(() => {
    hideLoading();
    let cancelled = false;
    (async () => {
      const [s, t, p, b, h] = await Promise.all([
        bank.supplyOrNull(UANML),
        shielded.turnstiles(),
        dex.poolForToken(UANML),
        explorer.burns(),
        personhood.registrationCount(),
      ]);
      if (cancelled) return;
      setSupply(s);
      setInPool(t ? (t.find((x) => x.denom === UANML)?.held ?? "0") : null);
      setPool(p);
      setBurned(amountOf(b.bySource.find((x) => x.source === "anml_buyback")?.amount, UANML));
      setHumans(h);
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [hideLoading]);

  const priceErth =
    pool && Number(pool.tokenReserve) > 0
      ? toMacro(pool.erthReserve, UERTH) / toMacro(pool.tokenReserve, UANML)
      : null;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>
          <img src="/images/coin/ANML.png" alt="" style={{ width: 28, verticalAlign: "middle", marginRight: 8 }} />
          ANML
        </h2>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Supply</span>
          <span className={styles.statValue}>{supply !== null ? fmt(supply, UANML) : "—"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Price (pool #{pool?.id ?? "1"})</span>
          <span className={styles.statValue}>
            {priceErth !== null && rate ? <Amount value={priceErth * rate} mode="price" /> : "—"}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Burned by buyback</span>
          <span className={styles.statValue}>{burned !== null ? fmt(burned, UANML) : "—"}</span>
        </div>
      </div>

      <MobileCta title="Claim, hold and trade ANML in the Earth Wallet app">
        Register your passport once, then claim 1 ANML a day. ANML is always private: claims,
        balances, sends and swaps are proofs made on your phone, and nobody can link them to you.
      </MobileCta>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Where ANML is</h3>
        <div className={styles.kv}>
          <div className={styles.kvLabel}>Shielded (held privately)</div>
          <div className={styles.kvValue}>{inPool !== null ? `${fmt(inPool, UANML)} ANML` : "—"}</div>
        </div>
        <div className={styles.kv}>
          <div className={styles.kvLabel}>In the ERTH pool</div>
          <div className={styles.kvValue}>
            {pool ? `${fmt(pool.tokenReserve, UANML)} ANML against ${fmt(pool.erthReserve, UERTH)} ERTH` : pool === null ? "No pool" : "—"}
          </div>
        </div>
        <div className={styles.kv}>
          <div className={styles.kvLabel}>Registered humans</div>
          <div className={styles.kvValue}>
            {humans !== null ? humans.toLocaleString() : "—"}{" "}
            <Link className={styles.link} to="/explorer/registrations">
              by country →
            </Link>
          </div>
        </div>
        <p className={forms.note}>
          Supply is everything minted by claims and registrations less what the buyback has burned.
          The buyback spends the individual pillar&apos;s emission on ANML from the pool and burns
          it; see <Link className={styles.link} to="/explorer/burns">burns</Link> for its history.
        </p>
      </div>

      {/* TODO(dex-notes, Phase 5): MsgBuyAnml — transparent ERTH from a Keplr
          account in, an ANML note out — is the one ANML action the web can
          sign. It needs the recipient's note commitment (pc), which in turn
          needs the shielded-address encoding (see chain/shielded.js). Add a
          "Buy ANML" card here once both exist. */}
    </div>
  );
};

export default Anml;
