import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Explorer.module.css";
import forms from "./Forms.module.css";
import { handleDirectory, statusAt, truncateAddress, LIVE, RENEWAL } from "../chain/handles";
import { useLoading } from "../contexts/LoadingContext";
import { leaseBounds, switchWaitDays } from "../chain/personhood";
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
  const [switchDays, setSwitchDays] = useState(null);

  useEffect(() => {
    let live = true;
    leaseBounds()
      .then((b) => live && setSwitchDays(switchWaitDays(b, "handle")))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  useEffect(() => {
    hideLoading();
    let live = true;
    // First paint from the served copy, every row pending; then every row
    // checked against the chain's own whole directory. Until a row is
    // verified its address is not offered for copying or paying.
    handleDirectory
      .all()
      .then((m) => {
        if (live) setDir((d) => d ?? [...m.values()].map((e) => ({ ...e, verified: null, problem: "" })));
      })
      .catch(() => {});
    handleDirectory
      .verifiedAll()
      .then((m) => {
        if (live) setDir([...m.values()]);
      })
      .catch((e) => {
        if (live) setError(`Couldn't check the handle directory against the chain: ${e.message}`);
      });
    return () => {
      live = false;
    };
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
        never renews on its own; the app reminds you before it ends. It can never be handed to anyone
        else&apos;s identity: every registration proves its identity&apos;s secret, so only your
        own identities can follow yours. After you switch identity or renew your registration (which
        uses your wallet&apos;s next identity, from the same recovery phrase), the app can move the
        handle to your new identity, and only there. Within one wallet the phrase is enough; from
        another wallet, both must be on the phone. Move before the handle&apos;s lease ends: only a
        live handle moves, and the old identity can no longer renew it. The app suggests a random
        time to move, at least 3 days before that, and never moves on its own. So renew your handle
        before your registration&apos;s year ends, and before you switch if its lease ends soon.
        Without a move (or if the old phrase is lost), the old identity&apos;s
        handle keeps resolving, unchangeable, until its lease ends. Renew it while it is live: in
        its renewal period it cannot be moved, and renewing it then counts as a new claim, which a
        passport that replaced another (a switch or renewal) cannot make until its
        predecessor&apos;s handle could have lapsed
        {switchDays ? ` (up to ${switchDays} days)` : ""}.
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
        {dir && !error && dir.some((e) => e.verified === null) && (
          <div className={styles.muted}>Checking every address against the chain&apos;s own directory…</div>
        )}
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
                const ok = e.verified === true;
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
                      <span className={styles.mono} title={ok ? e.address : undefined}>{truncateAddress(e.address)}</span>{" "}
                      {e.verified === null && <span className={styles.muted}>checking…</span>}
                      {e.verified === false && (
                        <span className={styles.badge} title={e.problem}>
                          Unverified: {e.problem}
                        </span>
                      )}{" "}
                      <button type="button" className={forms.ghostButton} disabled={!ok} onClick={() => ok && copy(e.address)}>
                        {copied === e.address && ok ? "Copied" : "Copy"}
                      </button>
                    </td>
                    <td>
                      {/* The handle rides in the fragment, which no request
                          carries: not the request line, not a Referer. */}
                      {st === LIVE && ok && (
                        <Link className={styles.link} to={{ pathname: "/shield", hash: `#to=${encodeURIComponent(`@${e.handle}`)}` }}>
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
