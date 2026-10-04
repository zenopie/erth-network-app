import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Explorer.module.css";
import forms from "./Forms.module.css";
import * as shielded from "../chain/shielded";
import * as bank from "../chain/bank";
import * as shieldedStaking from "../chain/shieldedStaking";
import { UERTH } from "../chain/config";
import { symbolOf, toMacro } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { SearchBar, short } from "../components/ExplorerBits";

const REFRESH_MS = 10000;
const fmt = (micro, denom) =>
  toMacro(micro ?? 0, denom).toLocaleString(undefined, { maximumFractionDigits: 2 });

/** "derth/earthvaloper1…" -> "derth · earthvaloper1abc…xyz" for the table. */
const assetLabel = (denom) => {
  const [head, ...rest] = denom.split("/");
  if (!rest.length) return symbolOf(denom);
  return `${head} · ${short(rest.join("/"), 16, 6)}`;
};

/**
 * The shielded pool: how many notes exist, and per asset what has entered
 * and left it. Every owner, value and transfer inside it is private; the
 * turnstiles are the public boundary, and `in - out` is exactly what the pool
 * module holds. derth is not a pool asset: it is held in stake notes (one per
 * owner and validator) in x/shieldedstaking's own tree, shown here by size
 * only. An undelegation is paid into this pool by the chain when it matures. LP shares
 * (dexlp/*) can be pool assets: shielded deposits mint them as notes, and they
 * leave only through a private withdrawal.
 */
const ExplorerShielded = () => {
  const { hideLoading } = useLoading();
  const [tree, setTree] = useState(null);
  const [rows, setRows] = useState(null);
  const [params, setParams] = useState(null);
  const [stakeTree, setStakeTree] = useState(null);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");

  useEffect(() => {
    hideLoading();
    let cancelled = false;
    const load = async () => {
      // Separate tree, separate module: never let it hold up the pool's figures.
      shieldedStaking.stakeTree().then((st) => !cancelled && setStakeTree(st));
      const [t, ts, as, p] = await Promise.all([
        shielded.tree(),
        shielded.turnstiles(),
        shielded.assets(),
        shielded.params(),
      ]);
      if (cancelled) return;
      if (!t && !ts) setError("Could not reach the shielded module.");
      else setError("");
      setTree(t);
      setParams(p);
      // Every admitted asset gets a row, including ones nothing has entered.
      const byDenom = new Map((ts ?? []).map((x) => [x.denom, x]));
      for (const a of as ?? []) {
        if (!byDenom.has(a.denom)) byDenom.set(a.denom, { denom: a.denom, in: "0", out: "0", held: "0" });
      }
      const list = [...byDenom.values()];
      // Bank supply only means something for native, IBC and LP-share denoms
      // (shares are bank coins; the pool holds the shielded ones).
      const hasSupply = (d) => !d.includes("/") || d.startsWith("ibc/") || d.startsWith("dexlp/");
      const supplies = await Promise.all(
        list.map((x) => (hasSupply(x.denom) ? bank.supplyOrNull(x.denom) : null)),
      );
      if (cancelled) return;
      setRows(
        list
          .map((x, i) => ({ ...x, supply: supplies[i] }))
          .sort((a, b) => (a.denom === UERTH ? -1 : b.denom === UERTH ? 1 : a.denom.localeCompare(b.denom))),
      );
    };
    load().catch((err) => !cancelled && setError(err.message));
    const id = setInterval(() => load().catch(() => {}), REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [hideLoading]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Shielded Pool</h2>
        <SearchBar onError={setSearchError} />
        {searchError && <div className={styles.searchError}>{searchError}</div>}
      </div>

      <Link className={styles.backLink} to="/explorer">
        ← Explorer
      </Link>

      {error && (
        <div className={styles.card}>
          <div className={styles.empty}>{error}</div>
        </div>
      )}

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Notes</span>
          <span className={styles.statValue}>{tree ? tree.size.toLocaleString() : "—"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Anchor height</span>
          <span className={styles.statValue}>
            {tree?.anchor ? (
              <Link className={styles.link} to={`/explorer/block/${tree.anchor.height}`}>
                {tree.anchor.height.toLocaleString()}
              </Link>
            ) : (
              "—"
            )}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Min private fee</span>
          <span className={styles.statValue}>{params ? `${fmt(params.minFee, UERTH)} ERTH` : "—"}</span>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Note tree</h3>
        <div className={styles.kv}>
          <div className={styles.kvLabel}>Current root</div>
          <div className={`${styles.kvValue} ${styles.mono}`}>{tree?.root || "—"}</div>
        </div>
        <div className={styles.kv}>
          <div className={styles.kvLabel}>Latest anchor</div>
          <div className={`${styles.kvValue} ${styles.mono}`}>{tree?.anchor?.root || "—"}</div>
        </div>
        <div className={styles.kv}>
          <div className={styles.kvLabel}>Root window</div>
          <div className={styles.kvValue}>
            {params ? `${Math.round(params.rootWindowSeconds / 86400)} days` : "—"}
          </div>
        </div>
        <div className={styles.kv}>
          <div className={styles.kvLabel}>Stake notes</div>
          <div className={styles.kvValue}>
            {stakeTree ? stakeTree.size.toLocaleString() : "—"}
            <span className={styles.muted}> (derth, one note per owner and validator, in x/shieldedstaking&apos;s own tree)</span>
          </div>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Assets</h3>
        {rows === null ? (
          <div className={styles.empty}>{error ? "—" : "Loading…"}</div>
        ) : rows.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Asset</th>
                <th>Shielded</th>
                <th>Entered</th>
                <th>Left</th>
                <th>Of supply</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.denom}>
                  <td className={r.denom.includes("/") ? styles.mono : ""}>{assetLabel(r.denom)}</td>
                  <td>{fmt(r.held, r.denom)}</td>
                  <td className={styles.muted}>{fmt(r.in, r.denom)}</td>
                  <td className={styles.muted}>{fmt(r.out, r.denom)}</td>
                  <td className={styles.muted}>
                    {r.supply && Number(r.supply) > 0
                      ? `${((Number(r.held) / Number(r.supply)) * 100).toFixed(1)}%`
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>No assets admitted yet.</div>
        )}
        <p className={forms.note}>
          Shielded is entered minus left, which the chain keeps equal to the pool&apos;s own
          balance. Notes minted inside the pool — registration rewards, ANML claims, undelegation
          payouts — count as entering it. LP shares held here are private: their owners are not
          public. derth is not in this pool: it is held in owner-locked stake notes in the staking
          module&apos;s own tree; see <Link className={styles.link} to="/stake-erth">staking</Link>.
        </p>
      </div>
    </div>
  );
};

export default ExplorerShielded;
