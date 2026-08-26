import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import styles from "./Explorer.module.css";
import * as explorer from "../chain/explorer";
import { useLoading } from "../contexts/LoadingContext";
import { Row, SearchBar, TxTable, short, timeAgo } from "../components/ExplorerBits";
import { symbolOf, toMacro } from "../chain/tokens";

/**
 * A coin amount, with precision that follows magnitude. A block mints and burns
 * single-digit ERTH and fractions of an ANML in the same breath, so a fixed
 * precision renders one of the two as zero.
 */
const amount = (base, denom) => {
  const n = toMacro(base, denom);
  if (!n) return "0";
  const digits = n >= 1000 ? 0 : n >= 1 ? 4 : 6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
};

const coinList = (coins) =>
  coins.length ? (
    coins.map((c) => (
      <div key={c.denom}>
        {amount(c.amount, c.denom)} {symbolOf(c.denom)}
      </div>
    ))
  ) : (
    <span className={styles.muted}>none</span>
  );

/** Block detail: header fields plus the transactions it contains. */
const ExplorerBlock = () => {
  const { height } = useParams();
  const { hideLoading } = useLoading();
  const [block, setBlock] = useState(null);
  const [txs, setTxs] = useState([]);
  const [monikers, setMonikers] = useState({});
  const [flows, setFlows] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    hideLoading();
    let cancelled = false;
    setBlock(null);
    setNotFound(false);

    (async () => {
      const [b, t, m, f] = await Promise.all([
        explorer.block(height),
        explorer.txsAtHeight(height),
        explorer.proposerMonikers().catch(() => ({})),
        explorer.blockFlows(height).catch(() => null),
      ]);
      if (cancelled) return;
      if (!b) {
        setNotFound(true);
        return;
      }
      setBlock(b);
      setTxs(t);
      setMonikers(m);
      setFlows(f);
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

          {flows && (
            <div className={styles.card}>
              <h3 className={styles.cardTitle}>Supply in this block</h3>
              <Row label="Minted">{coinList(flows.minted)}</Row>
              <Row label="Burned">{coinList(flows.burned)}</Row>
              {flows.bySource.length > 0 && (
                <Row label="Burned by">
                  {flows.bySource.map((s) => (
                    <div key={s.source}>
                      {explorer.burnSourceLabel(s.source)}{" "}
                      <span className={styles.muted}>
                        {s.amount.map((c) => `${amount(c.amount, c.denom)} ${symbolOf(c.denom)}`).join(", ")}
                      </span>
                    </div>
                  ))}
                </Row>
              )}
              <p className={styles.empty}>
                Read from this block's own events, not from the running totals. Minted is what x/bank
                created in the block; the pillars do not all issue on the same cadence, so a single
                block is not a quarter of the chain's per-second rate. LP shares burned on a
                liquidity withdrawal are excluded — they are a claim on a pool, not supply.
              </p>
            </div>
          )}

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
