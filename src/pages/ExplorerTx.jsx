import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import styles from "./Explorer.module.css";
import * as explorer from "../chain/explorer";
import { symbolOf, toMacro } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { Row, SearchBar, StatusBadge, TypeBadges, timeAgo } from "../components/ExplorerBits";

const formatCoins = (coins) =>
  !coins?.length
    ? "—"
    : coins.map((c) => `${toMacro(c.amount, c.denom).toLocaleString()} ${symbolOf(c.denom)}`).join(", ");

/** Transaction detail: result, fee, gas, and the decoded messages. */
const ExplorerTx = () => {
  const { hash } = useParams();
  const { hideLoading } = useLoading();
  const [tx, setTx] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    hideLoading();
    let cancelled = false;
    setTx(null);
    setNotFound(false);

    explorer
      .txByHash(hash)
      .then((t) => {
        if (cancelled) return;
        if (!t) setNotFound(true);
        else setTx(t);
      })
      .catch(() => !cancelled && setNotFound(true));

    return () => {
      cancelled = true;
    };
  }, [hash]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Transaction</h2>
        <SearchBar onError={setSearchError} />
        {searchError && <div className={styles.searchError}>{searchError}</div>}
      </div>

      <Link className={styles.backLink} to="/explorer">
        ← Explorer
      </Link>

      {notFound && (
        <div className={styles.card}>
          <div className={styles.empty}>
            Transaction not found. It may still be in the mempool, or the node may not have it
            indexed.
          </div>
        </div>
      )}

      {tx && (
        <>
          <div className={styles.card}>
            <Row label="Hash">
              <span className={styles.mono}>{tx.hash}</span>
            </Row>
            <Row label="Result">
              <StatusBadge success={tx.success} />
              {!tx.success && <span className={styles.muted}>code {tx.code}</span>}
            </Row>
            <Row label="Height">
              <Link className={styles.link} to={`/explorer/block/${tx.height}`}>
                {tx.height.toLocaleString()}
              </Link>
            </Row>
            <Row label="Time">
              {tx.timestamp ? (
                <>
                  {new Date(tx.timestamp).toLocaleString()}{" "}
                  <span className={styles.muted}>({timeAgo(tx.timestamp)})</span>
                </>
              ) : (
                "—"
              )}
            </Row>
            <Row label="Messages">
              <TypeBadges types={tx.types} />
            </Row>
            <Row label="Fee">{formatCoins(tx.fee)}</Row>
            <Row label="Gas">
              {tx.gasUsed.toLocaleString()} / {tx.gasWanted.toLocaleString()}
            </Row>
            {tx.memo && <Row label="Memo">{tx.memo}</Row>}
          </div>

          {/* A failed transaction is still on chain; the log says why. */}
          {!tx.success && tx.rawLog && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Failure reason</h3>
              <pre className={`${styles.pre} ${styles.errorLog}`}>{tx.rawLog}</pre>
            </div>
          )}

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Messages</h3>
            {tx.messages.length ? (
              tx.messages.map((m, i) => (
                <div key={i} style={{ marginBottom: 12 }}>
                  <div className={styles.badge}>{(m["@type"] ?? "").split(".").pop()}</div>
                  <pre className={styles.pre}>{JSON.stringify(m, null, 2)}</pre>
                </div>
              ))
            ) : (
              <div className={styles.empty}>No messages.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default ExplorerTx;
