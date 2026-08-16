import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import styles from "./Explorer.module.css";
import * as explorer from "../chain/explorer";
import { useLoading } from "../contexts/LoadingContext";
import { Row, SearchBar, TxTable, short, timeAgo } from "../components/ExplorerBits";

/** Block detail: header fields plus the transactions it contains. */
const ExplorerBlock = () => {
  const { height } = useParams();
  const { hideLoading } = useLoading();
  const [block, setBlock] = useState(null);
  const [txs, setTxs] = useState([]);
  const [monikers, setMonikers] = useState({});
  const [notFound, setNotFound] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    hideLoading();
    let cancelled = false;
    setBlock(null);
    setNotFound(false);

    (async () => {
      const [b, t, m] = await Promise.all([
        explorer.block(height),
        explorer.txsAtHeight(height),
        explorer.proposerMonikers().catch(() => ({})),
      ]);
      if (cancelled) return;
      if (!b) {
        setNotFound(true);
        return;
      }
      setBlock(b);
      setTxs(t);
      setMonikers(m);
    })();

    return () => {
      cancelled = true;
    };
  }, [height]);

  const h = Number(height);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Block</h2>
        <SearchBar onError={setSearchError} />
        {searchError && <div className={styles.searchError}>{searchError}</div>}
      </div>

      <Link className={styles.backLink} to="/explorer">
        ← Explorer
      </Link>

      {notFound && (
        <div className={styles.card}>
          <div className={styles.empty}>
            Block {height} not found — it may not have been produced yet.
          </div>
        </div>
      )}

      {block && (
        <>
          <div className={styles.card}>
            <Row label="Height">
              <span className={styles.mono}>{block.height.toLocaleString()}</span>
            </Row>
            <Row label="Time">
              {new Date(block.time).toLocaleString()}{" "}
              <span className={styles.muted}>({timeAgo(block.time)})</span>
            </Row>
            <Row label="Proposer">
              <span className={styles.mono}>
                {monikers[block.proposer] ? (
                  <>
                    {monikers[block.proposer]}{" "}
                    <span className={styles.muted}>{short(block.proposer, 14, 6)}</span>
                  </>
                ) : (
                  block.proposer
                )}
              </span>
            </Row>
            <Row label="Block hash">
              <span className={styles.mono}>{block.hash}</span>
            </Row>
            <Row label="Transactions">{block.txCount}</Row>
          </div>

          <div className={styles.card}>
            <h3 className={styles.cardTitle}>Transactions in this block</h3>
            <TxTable txs={txs} showHeight={false} />
          </div>

          <div className={styles.card}>
            <Link className={styles.link} to={`/explorer/block/${h - 1}`}>
              ← Block {h - 1}
            </Link>{" "}
            &nbsp;
            <Link className={styles.link} to={`/explorer/block/${h + 1}`}>
              Block {h + 1} →
            </Link>
          </div>
        </>
      )}
    </div>
  );
};

export default ExplorerBlock;
