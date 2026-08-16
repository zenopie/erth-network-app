import React from "react";
import { Link, useNavigate } from "react-router-dom";
import styles from "../pages/Explorer.module.css";
import { classifySearch } from "../chain/explorer";

/** Shortens a hash or address for table display. */
export const short = (s, head = 10, tail = 6) =>
  !s || s.length <= head + tail ? s || "" : `${s.slice(0, head)}…${s.slice(-tail)}`;

/** "3m ago" / "2h ago" — explorers show block age, not absolute time. */
export function timeAgo(iso) {
  if (!iso) return "";
  const secs = Math.max(0, Math.floor((Date.now() - new Date(iso).getTime()) / 1000));
  if (secs < 60) return `${secs}s ago`;
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  return `${Math.floor(secs / 86400)}d ago`;
}

/** Search box shared by every explorer view. */
export const SearchBar = ({ onError }) => {
  const navigate = useNavigate();
  const [term, setTerm] = React.useState("");

  const submit = (e) => {
    e.preventDefault();
    const hit = classifySearch(term);
    if (!hit) {
      onError?.("Enter a block height, a 64-character transaction hash, or an earth1… address.");
      return;
    }
    onError?.("");
    setTerm("");
    navigate(`/explorer/${hit.kind}/${hit.value}`);
  };

  return (
    <form className={styles.searchForm} onSubmit={submit}>
      <input
        className={styles.searchInput}
        placeholder="Search height, tx hash or address"
        value={term}
        onChange={(e) => setTerm(e.target.value)}
      />
      <button className={styles.searchButton} type="submit">
        Search
      </button>
    </form>
  );
};

/** Pass/fail pill for a transaction result. */
export const StatusBadge = ({ success }) => (
  <span className={`${styles.badge} ${success ? styles.badgeSuccess : styles.badgeFailed}`}>
    {success ? "Success" : "Failed"}
  </span>
);

/** Message-type pills, e.g. MsgSwap. */
export const TypeBadges = ({ types }) =>
  types.length ? (
    <>
      {types.map((t, i) => (
        <span key={i} className={styles.badge}>
          {t}
        </span>
      ))}
    </>
  ) : (
    <span className={styles.muted}>—</span>
  );

/** A single label/value row in a detail view. */
export const Row = ({ label, children }) => (
  <div className={styles.kv}>
    <div className={styles.kvLabel}>{label}</div>
    <div className={styles.kvValue}>{children}</div>
  </div>
);

/** Table of transactions, used by the overview, block and account views. */
export const TxTable = ({ txs, showHeight = true }) => {
  if (!txs.length) return <div className={styles.empty}>No transactions.</div>;
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Hash</th>
          {showHeight && <th>Height</th>}
          <th>Type</th>
          <th>Result</th>
          <th>Age</th>
        </tr>
      </thead>
      <tbody>
        {txs.map((tx) => (
          <tr key={tx.hash}>
            <td>
              <Link className={`${styles.link} ${styles.mono}`} to={`/explorer/tx/${tx.hash}`}>
                {short(tx.hash)}
              </Link>
            </td>
            {showHeight && (
              <td>
                <Link className={styles.link} to={`/explorer/block/${tx.height}`}>
                  {tx.height.toLocaleString()}
                </Link>
              </td>
            )}
            <td>
              <TypeBadges types={tx.types} />
            </td>
            <td>
              <StatusBadge success={tx.success} />
            </td>
            <td className={styles.muted}>{timeAgo(tx.timestamp)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
};
