import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import styles from "./Explorer.module.css";
import * as explorer from "../chain/explorer";
import * as staking from "../chain/staking";
import { balances } from "../chain/bank";
import { UERTH } from "../chain/config";
import { symbolOf, toMacro } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { Row, SearchBar, TxTable, short } from "../components/ExplorerBits";

/** Account detail: balances, delegations and transactions signed by this address. */
const ExplorerAccount = () => {
  const { address } = useParams();
  const { hideLoading } = useLoading();
  const [coins, setCoins] = useState({});
  const [delegations, setDelegations] = useState([]);
  const [rewards, setRewards] = useState("0");
  const [txs, setTxs] = useState([]);
  const [loaded, setLoaded] = useState(false);
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    hideLoading();
    let cancelled = false;
    setLoaded(false);

    (async () => {
      const [b, d, r, t] = await Promise.all([
        balances(address),
        staking.delegations(address),
        staking.totalRewards(address),
        explorer.txsForAddress(address),
      ]);
      if (cancelled) return;
      setCoins(b);
      setDelegations(d);
      setRewards(r);
      setTxs(t);
      setLoaded(true);
    })();

    return () => {
      cancelled = true;
    };
  }, [address]);

  const coinList = Object.entries(coins);
  const totalDelegated = delegations.reduce((s, d) => s + Number(d.amount), 0);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Account</h2>
        <SearchBar onError={setSearchError} />
        {searchError && <div className={styles.searchError}>{searchError}</div>}
      </div>

      <Link className={styles.backLink} to="/explorer">
        ← Explorer
      </Link>

      <div className={styles.card}>
        <Row label="Address">
          <span className={styles.mono}>{address}</span>
        </Row>
        <Row label="Delegated">
          {toMacro(totalDelegated, UERTH).toLocaleString()} ERTH
        </Row>
        <Row label="Pending rewards">{toMacro(rewards, UERTH).toLocaleString()} ERTH</Row>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Balances</h3>
        {coinList.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Token</th>
                <th>Amount</th>
                <th>Denom</th>
              </tr>
            </thead>
            <tbody>
              {coinList.map(([denom, amount]) => (
                <tr key={denom}>
                  <td>{symbolOf(denom)}</td>
                  <td>{toMacro(amount, denom).toLocaleString()}</td>
                  <td className={`${styles.mono} ${styles.muted}`}>{denom}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>
            {loaded ? "This address holds no tokens." : "Loading…"}
          </div>
        )}
      </div>

      {delegations.length > 0 && (
        <div className={styles.card}>
          <h3 className={styles.cardTitle}>Delegations</h3>
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Validator</th>
                <th>Amount</th>
              </tr>
            </thead>
            <tbody>
              {delegations.map((d) => (
                <tr key={d.validator}>
                  <td className={styles.mono}>{short(d.validator, 20, 8)}</td>
                  <td>{toMacro(d.amount, UERTH).toLocaleString()} ERTH</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Transactions</h3>
        {/* Only transactions *signed* by this address — transfers received are
            not included, since they are indexed under the sender. */}
        <TxTable txs={txs} />
      </div>
    </div>
  );
};

export default ExplorerAccount;
