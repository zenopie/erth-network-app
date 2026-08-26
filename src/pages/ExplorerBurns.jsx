import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import styles from "./Explorer.module.css";
import * as explorer from "../chain/explorer";
import * as bank from "../chain/bank";
import * as dex from "../chain/dex";
import { UANML, UERTH } from "../chain/config";
import { symbolOf, toMacro } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { SearchBar, timeAgo } from "../components/ExplorerBits";

const REFRESH_MS = 15000;

// The chain issues a fixed 4 ERTH/sec forever — one per pillar, see
// x/earth/types/keys.go. It is a constant rather than a query because nothing
// can change it: there is no parameter behind it and no schedule to read.
const UERTH_PER_SECOND = 4_000_000;
const SECONDS_PER_DAY = 86400;

/** Base units -> a display figure with thousands separators. */
const amount = (base, denom, digits = 2) =>
  toMacro(base, denom).toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });

/**
 * A share, as a percent.
 *
 * A real burn can still round to nothing: 1,958 ERTH against a 2.5B supply is
 * 0.00008%, and "0.00%" reads as a confident zero rather than "too small to
 * show". The distinction a reader cares about is burned-nothing versus
 * burned-almost-nothing, so the floor is spelled out — the same convention
 * formatApr uses on yields.
 */
const pct = (part, whole) => {
  if (!(whole > 0)) return "—";
  const p = (part / whole) * 100;
  if (p > 0 && p < 0.01) return "<0.01%";
  return `${p.toFixed(2)}%`;
};

const amountOf = (coins, denom) =>
  Number(coins.find((c) => c.denom === denom)?.amount ?? 0);

/**
 * Burns: what the chain has destroyed, and how that compares to what it issues.
 *
 * Every figure here comes from x/earth's counters rather than from summing
 * events. Three of the five mechanisms burn in EndBlock, so a client assembling
 * this from transaction history would silently miss most of it — see
 * x/earth/keeper/burns.go.
 */
const ExplorerBurns = () => {
  const { hideLoading } = useLoading();
  const [burns, setBurns] = useState(null);
  const [supplies, setSupplies] = useState({});
  const [pol, setPol] = useState([]);
  const [genesis, setGenesis] = useState(null);
  const [now, setNow] = useState(null);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");

  // Block 1's timestamp is the chain's age, and it never changes, so it is read
  // once rather than on every poll.
  useEffect(() => {
    explorer
      .block(1)
      .then((b) => b && setGenesis(new Date(b.time).getTime()))
      .catch(console.error);
  }, []);

  useEffect(() => {
    hideLoading();
    let cancelled = false;

    const load = async () => {
      try {
        const [b, erth, anml, p, status] = await Promise.all([
          explorer.burns(),
          bank.supply(UERTH),
          bank.supply(UANML),
          dex.polBurns(),
          explorer.status(),
        ]);
        if (cancelled) return;
        setBurns(b);
        setSupplies({ [UERTH]: Number(erth), [UANML]: Number(anml) });
        setPol(p);
        setNow(new Date(status.time).getTime());
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

  const total = burns?.total ?? [];
  const burnedErth = amountOf(total, UERTH);
  const burnedAnml = amountOf(total, UANML);

  // Chain age drives every rate on this page. Both ends come from block
  // timestamps rather than the browser's clock, so a viewer whose machine is
  // wrong does not see a wrong burn rate.
  const ageSeconds = genesis && now ? Math.max(1, (now - genesis) / 1000) : null;

  // Averages since genesis, not current rates: without a stored time series the
  // chain cannot say what today's burn was, and a figure labelled "per day" that
  // silently meant "since launch" would be the page's worst lie.
  const burnedErthPerDay = ageSeconds
    ? (toMacro(burnedErth, UERTH) / ageSeconds) * SECONDS_PER_DAY
    : null;
  const issuedPerDay = (UERTH_PER_SECOND / 1e6) * SECONDS_PER_DAY;
  const netPerDay = burnedErthPerDay === null ? null : issuedPerDay - burnedErthPerDay;

  // Sorted largest first: the reader wants to know what is doing the burning,
  // and the chain's own ordering is alphabetical by source key.
  const bySource = [...(burns?.bySource ?? [])].sort(
    (a, b) => amountOf(b.amount, UERTH) - amountOf(a.amount, UERTH),
  );
  const totalForShare = bySource.reduce((s, r) => s + amountOf(r.amount, UERTH), 0);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h2 className={styles.title}>Burns</h2>
        <SearchBar onError={setSearchError} />
        {searchError && <div className={styles.searchError}>{searchError}</div>}
      </div>

      <Link className={styles.backLink} to="/explorer">
        ← Explorer
      </Link>

      {error && (
        <div className={styles.card}>
          <div className={styles.empty}>Could not reach the chain: {error}</div>
        </div>
      )}

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>ERTH burned</span>
          <span className={styles.statValue}>{burns ? amount(burnedErth, UERTH, 0) : "—"}</span>
          <span className={styles.statLabel}>
            {burns && supplies[UERTH] ? `${pct(burnedErth, supplies[UERTH])} of supply` : ""}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>ANML burned</span>
          <span className={styles.statValue}>{burns ? amount(burnedAnml, UANML, 0) : "—"}</span>
          <span className={styles.statLabel}>
            {burns && supplies[UANML] ? `${pct(burnedAnml, supplies[UANML])} of supply` : ""}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Net ERTH / day</span>
          <span className={styles.statValue}>
            {netPerDay === null
              ? "—"
              : `${netPerDay > 0 ? "+" : ""}${netPerDay.toLocaleString(undefined, {
                  maximumFractionDigits: 0,
                })}`}
          </span>
          <span className={styles.statLabel}>average since genesis</span>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Issuance against burn</h3>
        <p className={styles.empty}>
          The chain issues a fixed 4 ERTH per second — one for each of the four pillars — forever.
          Because that rate is constant while the supply it adds to grows, inflation falls on its
          own without a schedule or a halving. Burning is what could take it below zero.
        </p>
        <table className={styles.table}>
          <tbody>
            <tr>
              <td>Issued</td>
              <td className={styles.mono}>
                {issuedPerDay.toLocaleString(undefined, { maximumFractionDigits: 0 })} ERTH / day
              </td>
              <td className={styles.muted}>fixed by design</td>
            </tr>
            <tr>
              <td>Burned</td>
              <td className={styles.mono}>
                {burnedErthPerDay === null
                  ? "—"
                  : `${burnedErthPerDay.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })} ERTH / day`}
              </td>
              <td className={styles.muted}>average since genesis</td>
            </tr>
            <tr>
              <td>Net</td>
              <td className={styles.mono}>
                {netPerDay === null
                  ? "—"
                  : `${netPerDay > 0 ? "+" : ""}${netPerDay.toLocaleString(undefined, {
                      maximumFractionDigits: 0,
                    })} ERTH / day`}
              </td>
              <td className={styles.muted}>
                {netPerDay === null ? "" : netPerDay > 0 ? "inflationary" : "deflationary"}
              </td>
            </tr>
          </tbody>
        </table>
        <p className={styles.empty}>
          Burn is an average over the chain's whole life, because the counters are running totals
          rather than a time series. On a young chain that average is dominated by however much has
          been traded so far.
        </p>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Where the burn comes from</h3>
        {bySource.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Source</th>
                <th>Burned</th>
                <th>Share</th>
              </tr>
            </thead>
            <tbody>
              {bySource.map((row) => (
                <tr key={row.source}>
                  <td>
                    {explorer.burnSourceLabel(row.source)}
                    <div className={styles.muted} style={{ fontSize: 12 }}>
                      {explorer.burnSourceNote(row.source)}
                    </div>
                  </td>
                  <td className={styles.mono}>
                    {row.amount.map((c) => (
                      <div key={c.denom}>
                        {amount(c.amount, c.denom, 0)} {symbolOf(c.denom)}
                      </div>
                    ))}
                  </td>
                  <td className={styles.muted}>
                    {amountOf(row.amount, UERTH) > 0
                      ? pct(amountOf(row.amount, UERTH), totalForShare)
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>
            Nothing has been burned yet. The gas split runs on every block that carries a
            transaction, so this fills in as soon as the chain is used.
          </div>
        )}
        <p className={styles.empty}>
          Share is of ERTH burned, so a source that only destroys another coin — the ANML buyback —
          shows none of it. LP shares burned when protocol liquidity is retired are left out
          entirely: they are a claim on a pool, not supply.
        </p>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Protocol liquidity being retired</h3>
        {pol.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Pool</th>
                <th>Retired</th>
                <th>Finishes</th>
                <th>Spoke side</th>
              </tr>
            </thead>
            <tbody>
              {pol.map((b) => {
                const done = Number(b.totalShares) - Number(b.sharesRemaining);
                const ends = (b.startTime + b.durationSeconds) * 1000;
                return (
                  <tr key={b.poolId}>
                    <td>#{b.poolId}</td>
                    <td className={styles.mono}>{pct(done, Number(b.totalShares))}</td>
                    <td className={styles.muted}>
                      {b.startTime > 0 ? new Date(ends).toLocaleDateString() : "not started"}
                    </td>
                    <td className={styles.muted}>
                      {b.burnToken ? "burned" : "stays in the pool"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>
            No protocol liquidity is being retired. A finished schedule is deleted, so this is also
            what a fully retired position looks like.
          </div>
        )}
        <p className={styles.empty}>
          The chain starts owning its own liquidity and gives it up on a straight line over five
          years. A tranche is priced against the reserves exactly as a withdrawal would be and then
          destroyed — both sides shrink together, so retiring it does not move the pool's price.
        </p>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Supply</h3>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Coin</th>
              <th>Circulating</th>
              <th>Burned</th>
              <th>Burned / created</th>
            </tr>
          </thead>
          <tbody>
            {[UERTH, UANML].map((denom) => {
              const supply = supplies[denom] ?? 0;
              const burned = amountOf(total, denom);
              return (
                <tr key={denom}>
                  <td>{symbolOf(denom)}</td>
                  <td className={styles.mono}>{amount(supply, denom, 0)}</td>
                  <td className={styles.mono}>{amount(burned, denom, 0)}</td>
                  <td className={styles.muted}>{pct(burned, supply + burned)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <p className={styles.empty}>
          Circulating is what x/bank still counts; burned is what x/earth recorded leaving it. The
          last column is the share of everything ever created that no longer exists.
        </p>
      </div>

      {now && (
        <div className={styles.empty}>
          Chain time {timeAgo(new Date(now).toISOString())}
          {genesis ? `, running since ${new Date(genesis).toLocaleDateString()}` : ""}.
        </div>
      )}
    </div>
  );
};

export default ExplorerBurns;
