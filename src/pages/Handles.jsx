import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Explorer.module.css";
import forms from "./Forms.module.css";
import { handleDirectory, statusAt, truncateAddress, LIVE, RENEWAL } from "../chain/handles";
import { useLoading } from "../contexts/LoadingContext";
import MobileCta from "../components/MobileCta";

const date = (s) => (s ? new Date(s * 1000).toLocaleString() : "—");
const SHOWN = 200;

/**
 * The handle directory: every handle and the shielded address it names.
 *
 * Downloaded whole and filtered here, never asked about one handle at a time:
 * a lookup of the handle someone is about to pay would tell the server who
 * pays whom. A handle is live until it expires; then, for its renewal period,
 * only its owner may renew it and it pays nobody; then anyone may claim it.
 * Handles are claimed and renewed in the Earth Wallet app.
 */
const Handles = () => {
  const { hideLoading } = useLoading();
  const [dir, setDir] = useState(null);
  const [error, setError] = useState("");
  const [term, setTerm] = useState("");
  const [copied, setCopied] = useState("");

  useEffect(() => {
    hideLoading();
    handleDirectory
      .all()
      .then((m) => setDir([...m.values()]))
      .catch((e) => setError(`Couldn't read the handle directory: ${e.message}`));
  }, [hideLoading]);

  const now = Math.floor(Date.now() / 1000);
  const q = term.trim().replace(/^@/, "").toLowerCase();
  const rows = useMemo(
    () => (dir ?? []).filter((e) => !q || e.handle.includes(q) || e.address === term.trim()),
    [dir, q, term],
  );

  const copy = async (a) => {
    try {
      await navigator.clipboard.writeText(a);
      setCopied(a);
      setTimeout(() => setCopied(""), 1500);
    } catch {
      /* clipboard refused */
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Handles</h2>
      </div>

      <MobileCta title="Claim your handle in the Earth Wallet app">
        A handle lets anyone pay you by name: their wallet looks it up here and sends to your
        shielded address. Who holds a handle is not public. It lasts a year from each renewal and
        never renews on its own; the app reminds you before it ends.
      </MobileCta>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>
          Directory{dir ? ` · ${dir.length.toLocaleString()} handles` : ""}
        </h3>
        <div className={forms.formRow}>
          <input
            className={`${forms.input} ${forms.field}`}
            placeholder="Search @handle or paste erthz1…"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
            spellCheck={false}
            autoComplete="off"
          />
        </div>
        {error && <div className={styles.searchError}>{error}</div>}
        {!dir && !error && <div className={styles.muted}>Loading the whole directory…</div>}
        {dir && rows.length === 0 && <div className={styles.empty}>No handle matches.</div>}
        {rows.length > 0 && (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Handle</th>
                <th>Status</th>
                <th>Expires</th>
                <th>Renewable until</th>
                <th>Address</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.slice(0, SHOWN).map((e) => {
                const st = statusAt(e, now);
                return (
                  <tr key={e.handle}>
                    <td className={styles.mono}>@{e.handle}</td>
                    <td>
                      <span className={`${styles.badge} ${st === LIVE ? styles.badgeSuccess : ""}`}>
                        {st === LIVE ? "Live" : st === RENEWAL ? "Renewal period" : "Free"}
                      </span>
                    </td>
                    <td>{date(e.expiresAt)}</td>
                    <td>{date(e.renewalUntil)}</td>
                    <td>
                      <span className={styles.mono} title={e.address}>{truncateAddress(e.address)}</span>{" "}
                      <button type="button" className={forms.ghostButton} onClick={() => copy(e.address)}>
                        {copied === e.address ? "Copied" : "Copy"}
                      </button>
                    </td>
                    <td>
                      {st === LIVE && (
                        <Link className={styles.link} to={`/shield?to=${encodeURIComponent(`@${e.handle}`)}`}>
                          Pay
                        </Link>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {rows.length > SHOWN && (
          <div className={styles.muted}>Showing {SHOWN} of {rows.length}; narrow the search.</div>
        )}
      </div>
    </div>
  );
};

export default Handles;
