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

// What the chain is designed to issue: 4 ERTH/sec forever, one per pillar (see
// x/earth/types/keys.go). Shown as the design rate and never used to compute
// net, because the pillars do not all start issuing at launch — the allocation
// streams wait for allocations to be set and the buyback waits for its TWAP
// window. A chain minting one pillar is not broken, but a page that assumed
// four would report it as inflationary while supply was falling.
const DESIGN_UERTH_PER_SECOND = 4_000_000;
const SECONDS_PER_DAY = 86400;

/**
 * Base units -> a display figure, with precision that follows magnitude.
 *
 * The figures on this page span nine orders of magnitude, and one row holds
 * both ends of that: a pol retirement burns thousands of ERTH and, in the same
 * tranche, a fraction of an ANML, because it destroys both sides of the pool in
 * proportion to reserves that sit at 86,400:1. Rounding to whole units printed
 * that ANML as "0" — a burn that happened, reported as nothing. Reporting a
 * real burn as zero is the one thing this page must never do.
 */
const amount = (base, denom) => {
  const n = toMacro(base, denom);
  if (!n) return "0";
  const digits = n >= 1000 ? 0 : n >= 1 ? 2 : 6;
  return n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: digits });
};

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

/** An ERTH-per-day figure, signed when it is a net. */
const fmtDay = (v, signed = false) => {
  if (v === null || v === undefined || !Number.isFinite(v)) return "—";
  const sign = signed && v > 0 ? "+" : "";
  return `${sign}${v.toLocaleString(undefined, { maximumFractionDigits: 0 })} ERTH / day`;
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
  const [flows, setFlows] = useState(null);
  const [pol, setPol] = useState([]);
  const [genesis, setGenesis] = useState(null);
  const [now, setNow] = useState(null);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");

  // Block 1's timestamp is the chain's age, and it never changes, so it is read
  // once rather than on every poll.
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
        // Separate from the reads above: this is ~20 RPC round trips, so a
        // failure here must leave the totals on screen rather than blanking the
        // page, and it is not worth blocking them on.
        explorer
          .recentFlows()
          .then((f) => !cancelled && setFlows(f))
          .catch(() => !cancelled && setFlows(null));
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

  // Rates are measured over the recent window rather than since genesis: the
  // pillars come online one at a time, so a lifetime average describes a chain
  // that is no longer running.
  const rate = (base) =>
    flows && flows.seconds > 0 ? (toMacro(base, UERTH) / flows.seconds) * SECONDS_PER_DAY : null;

  const mintedPerDay = rate(flows?.minted?.[UERTH] ?? 0);
  const burnedPerDay = rate(flows?.burned?.[UERTH] ?? 0);
  const netPerDay =
    mintedPerDay === null || burnedPerDay === null ? null : mintedPerDay - burnedPerDay;
  const designPerDay = (DESIGN_UERTH_PER_SECOND / 1e6) * SECONDS_PER_DAY;
  const windowLabel = flows ? `last ${flows.blocks} blocks (~${Math.round(flows.seconds)}s)` : "";

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
          <span className={styles.statValue}>{burns ? amount(burnedErth, UERTH) : "—"}</span>
          <span className={styles.statLabel}>
            {burns && supplies[UERTH] ? `${pct(burnedErth, supplies[UERTH])} of supply` : ""}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>ANML burned</span>
          <span className={styles.statValue}>{burns ? amount(burnedAnml, UANML) : "—"}</span>
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
          <span className={styles.statLabel}>{windowLabel || "measured"}</span>
        </div>
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Issuance against burn</h3>
        <p className={styles.empty}>
          Measured from the blocks themselves — x/bank emits an event when it mints and when it
          burns — over the {windowLabel || "recent window"}. Not assumed from the design rate, and
          not averaged over the chain's whole life: the pillars start issuing at different moments,
          so both of those describe something other than what is running now.
        </p>
        <table className={styles.table}>
          <tbody>
            <tr>
              <td>Issued</td>
              <td className={styles.mono}>{fmtDay(mintedPerDay)}</td>
              <td className={styles.muted}>measured</td>
            </tr>
            <tr>
              <td>Burned</td>
              <td className={styles.mono}>{fmtDay(burnedPerDay)}</td>
              <td className={styles.muted}>measured</td>
            </tr>
            <tr>
              <td>Net</td>
              <td className={styles.mono}>{fmtDay(netPerDay, true)}</td>
              <td className={styles.muted}>
                {netPerDay === null ? "" : netPerDay > 0 ? "inflationary" : "deflationary"}
              </td>
            </tr>
            <tr>
              <td className={styles.muted}>Design rate</td>
              <td className={`${styles.mono} ${styles.muted}`}>{fmtDay(designPerDay)}</td>
              <td className={styles.muted}>4 ERTH/s, all four pillars</td>
            </tr>
          </tbody>
        </table>
        <p className={styles.empty}>
          Issued sits below the design rate until every pillar is live: the allocation streams wait
          for allocations to be set, and the ANML buyback waits for its price window to fill. The
          totals above are lifetime figures from the chain's counters; only these rates are windowed.
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
                        {amount(c.amount, c.denom)} {symbolOf(c.denom)}
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
                  <td className={styles.mono}>{amount(supply, denom)}</td>
                  <td className={styles.mono}>{amount(burned, denom)}</td>
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
