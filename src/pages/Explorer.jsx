import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Explorer.module.css";
import * as explorer from "../chain/explorer";
import { useLoading } from "../contexts/LoadingContext";
import { SearchBar, TxTable, short, timeAgo } from "../components/ExplorerBits";

const REFRESH_MS = 5000;

/** Explorer overview: chain status, latest blocks and latest transactions. */
const Explorer = () => {
  const { hideLoading } = useLoading();
  const [status, setStatus] = useState(null);
  const [blocks, setBlocks] = useState([]);
  const [txs, setTxs] = useState([]);
  const [monikers, setMonikers] = useState({});
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");

  // Validator monikers change rarely, so they are fetched once rather than
  // on every poll.
  useEffect(() => {
    explorer.proposerMonikers().then(setMonikers).catch(console.error);
  }, []);

  useEffect(() => {
    hideLoading();
    let cancelled = false;

    const load = async () => {
      try {
        const [s, b, t] = await Promise.all([
          explorer.status(),
          explorer.recentBlocks(10),
          explorer.recentTxs(10),
        ]);
        if (cancelled) return;
        setStatus(s);
        setBlocks(b);
        setTxs(t);
        setError("");
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    };

    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, []);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Explorer</h2>
        <SearchBar onError={setSearchError} />
        {searchError && <div className={styles.searchError}>{searchError}</div>}
      </div>

      <Link className={styles.backLink} to="/explorer/validators">
        Validators →
      </Link>
      &nbsp;&nbsp;
      <Link className={styles.backLink} to="/explorer/registrations">
        Registrations →
      </Link>
      &nbsp;&nbsp;
      <Link className={styles.backLink} to="/explorer/burns">
        Burns →
      </Link>

      {error && (
        <div className={styles.card}>
          <div className={styles.empty}>Could not reach the chain: {error}</div>
        </div>
      )}

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Chain</span>
          <span className={styles.statValue}>{status?.chainId ?? "—"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Height</span>
          <span className={styles.statValue}>{status ? status.height.toLocaleString() : "—"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Last block</span>
          <span className={styles.statValue}>{status ? timeAgo(status.time) : "—"}</span>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Latest Blocks</h3>
        {blocks.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Height</th>
                <th>Proposer</th>
                <th>Txs</th>
                <th>Age</th>
              </tr>
            </thead>
            <tbody>
              {blocks.map((b) => (
                <tr key={b.height}>
                  <td>
                    <Link className={styles.link} to={`/explorer/block/${b.height}`}>
                      {b.height.toLocaleString()}
                    </Link>
                  </td>
                  <td className={styles.mono}>
                    {monikers[b.proposer] || short(b.proposer, 14, 6)}
                  </td>
                  <td>{b.txCount}</td>
                  <td className={styles.muted}>{timeAgo(b.time)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>Loading blocks…</div>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Latest Transactions</h3>
        <TxTable txs={txs} />
      </div>
    </div>
  );
};

export default Explorer;
