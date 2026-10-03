import React, { useCallback, useEffect, useState } from "react";
import styles from "./Explorer.module.css";
import forms from "./Forms.module.css";
import * as personhood from "../chain/personhood";
import { canonicalAddress } from "../chain/address";
import { ADDRESS_PREFIX } from "../chain/config";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import MobileCta from "../components/MobileCta";


/**
 * Referrers.
 *
 * A registered human can bind an address as a referrer from the mobile app —
 * anonymously: the binding is keyed by a nullifier that says nothing about
 * who made it. While the binding is live, a new registration naming that
 * address as its affiliate pays the referrer's half of the reward to it, in
 * transparent ERTH. The address and its expiry are public, so anyone can
 * check one here before sharing it.
 */
const Referrers = () => {
  const { hideLoading } = useLoading();
  const { address } = useWallet();
  const [term, setTerm] = useState("");
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");
  const [days, setDays] = useState(null);

  useEffect(() => {
    hideLoading();
    personhood
      .params()
      .then((p) => setDays(p ? Math.round(p.caretakerVoteSeconds / 86400) : null))
      .catch(() => {});
  }, [hideLoading]);

  const lookup = useCallback(async (input) => {
    setError("");
    setResult(null);
    // Referrers are keyed by the canonical (lowercase) address.
    const addr = canonicalAddress(input);
    if (!addr) {
      setError(`Enter an ${ADDRESS_PREFIX}1… address.`);
      return;
    }
    const r = await personhood.referrer(addr);
    if (!r) {
      setError("Could not reach the chain.");
      return;
    }
    setResult({ address: addr, ...r });
  }, []);

  // A connected wallet checks itself, which is the common question.
  useEffect(() => {
    if (address) {
      setTerm(address);
      lookup(address);
    }
  }, [address, lookup]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Referrers</h2>
      </div>

      <MobileCta title="Become a referrer in the Earth Wallet app">
        Bind your address once you are registered. Each registration that names it pays you the
        referrer&apos;s half of the reward in ERTH. A binding lasts {days ?? 30} days and the app
        renews it; binding is anonymous, the address is not.
      </MobileCta>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Check an address</h3>
        <form
          className={forms.formRow}
          onSubmit={(e) => {
            e.preventDefault();
            lookup(term.trim());
          }}
        >
          <input
            className={`${forms.input} ${forms.field}`}
            placeholder={`${ADDRESS_PREFIX}1…`}
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
          <button className={forms.button} type="submit">
            Check
          </button>
        </form>
        {error && <div className={styles.searchError}>{error}</div>}
        {result && (
          <div className={styles.kv}>
            <div className={styles.kvLabel}>
              <span className={`${styles.badge} ${result.live ? styles.badgeSuccess : ""}`}>
                {result.live ? "Live" : "Not a referrer"}
              </span>
            </div>
            <div className={styles.kvValue}>
              <span className={styles.mono}>{result.address}</span>
              <div className={styles.muted}>
                {result.live
                  ? `Registrations may name it until ${new Date(result.expiresAt * 1000).toLocaleString()}.`
                  : "A registration naming this address would be refused."}
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default Referrers;
