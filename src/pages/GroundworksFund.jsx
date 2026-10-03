import React, { useCallback, useEffect, useState } from "react";
import styles from "./Explorer.module.css";
import page from "./GroundworksFund.module.css";
import AllocationFund from "../components/AllocationFund";
import AllocationOptionsTable from "../components/AllocationOptionsTable";
import MobileCta from "../components/MobileCta";
import StatusModal from "../components/StatusModal";
import { short } from "../components/ExplorerBits";
import * as allocation from "../chain/allocation";
import * as assembly from "../chain/assembly";
import * as explorer from "../chain/explorer";
import * as shieldedStaking from "../chain/shieldedStaking";
import { broadcast } from "../chain/tx";
import { UERTH } from "../chain/config";
import { byBigDesc, formatMacro, percentString, sumBig, toBigInt } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";

// Weights and amounts are integer strings past 2^53; never through Number.
const erth = (micro) => `${formatMacro(micro, UERTH)} ERTH`;
const when = (unix) => (unix ? new Date(unix * 1000).toLocaleString() : "—");

/**
 * The Groundworks Fund: x/allocation's stake-weighted stream.
 *
 * Its weight is almost all Groundworks positions — private derth locked in
 * x/shieldedstaking and split across options. Its owner is known only by an
 * owner tag its stake proofs reproduce, so each position's split and weight
 * are public and its owner is not. The stream weighs positions per
 * validator: each validator's positions are one weighted voter with an
 * absolute weight per option (allocation.validatorVoter), shown in "By
 * validator". The rest is
 * validators' transparent self-bond, which an operator can still direct here
 * with Keplr. The assembly (one human, one vote) can strike an option; its
 * open removal ballots are listed at the bottom.
 */
const GroundworksFund = () => {
  const { address } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, error: txError, txHash, execute, closeModal } = useTransaction();
  const [view, setView] = useState(undefined);
  const [positions, setPositions] = useState(undefined);
  const [ballots, setBallots] = useState(undefined);
  const [monikers, setMonikers] = useState({});
  const [voters, setVoters] = useState(undefined);

  const load = useCallback(async () => {
    showLoading();
    try {
      const [v, p, b, vals] = await Promise.all([
        allocation.streamView(allocation.STREAM_GROUNDWORKS),
        shieldedStaking.positions(),
        assembly.removalBallots(),
        explorer.validators().catch(() => null),
      ]);
      setView(v);
      setPositions(p);
      // One weighted voter per validator with positions: what the stream
      // actually counts.
      const withPositions = [...new Set((p ?? []).map((x) => x.validator))];
      setVoters(p ? await allocation.validatorVoters(withPositions) : null);
      setBallots(b);
      setMonikers(
        Object.fromEntries((vals?.validators ?? []).map((x) => [x.operator, x.moniker])),
      );
    } finally {
      hideLoading();
    }
  }, [showLoading, hideLoading]);

  useEffect(() => {
    load();
  }, [load]);

  const claim = (o) =>
    execute(async () => {
      await broadcast([allocation.msgClaimAllocation(address, allocation.STREAM_GROUNDWORKS, o.id)]);
      load();
    });

  const options = view === undefined ? [] : (view?.options ?? null);
  const optionName = (id) => {
    const o = (options ?? []).find((x) => x.id === id);
    return o ? `#${id} ${o.description}` : `#${id}`;
  };
  // The stream counts each validator's voter, not the positions one by one.
  const positionWeight = sumBig(Object.values(voters ?? {}).map((v) => v?.weight));
  const totalWeight = toBigInt(view?.totalWeight);
  const streamEpoch = Number(view?.epoch ?? 0);
  // A split cast before a Groundworks reset no longer counts (weight 0) until
  // its owner votes again.
  const lapsed = (p) => p.splits.length > 0 && p.splitEpoch < streamEpoch;
  const byValidator = Object.entries(
    (positions ?? []).reduce((acc, p) => {
      const a = (acc[p.validator] ??= { count: 0, derth: 0n });
      a.count += 1;
      a.derth += toBigInt(p.derth);
      return acc;
    }, {}),
  ).map(([validator, a]) => ({ validator, ...a, voter: voters?.[validator] ?? null }))
    .sort((x, y) => byBigDesc(x.voter?.weight, y.voter?.weight));

  return (
    <div className={styles.page}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} txHash={txHash} />

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total weight</span>
          <span className={styles.statValue}>{view ? erth(view.totalWeight) : "—"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Positions</span>
          <span className={styles.statValue}>{positions ? positions.length.toLocaleString() : "—"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>From positions</span>
          <span className={styles.statValue}>
            {positions && voters && totalWeight > 0n
              ? `${percentString(positionWeight > totalWeight ? totalWeight : positionWeight, totalWeight)}%`
              : "—"}
          </span>
        </div>
      </div>

      <MobileCta title="Direct Groundworks with a position in the Earth Wallet app">
        Lock privately staked ERTH into a position and split it across these options. The split
        and its weight are public; who owns it is not. The position keeps earning staking rewards
        while it votes.
      </MobileCta>

      <div className={page.chart}>
        <AllocationFund
          title="Groundworks Fund"
          stream={allocation.STREAM_GROUNDWORKS}
          options={options}
          streamEpoch={streamEpoch}
          onChanged={load}
        />
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Options</h3>
        <AllocationOptionsTable options={options} address={address} onClaim={claim} />
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>By validator</h3>
        <p className={styles.muted}>
          The stream weighs positions per validator: all of a validator&apos;s positions are one
          voter, with weight on each option = its epoch rate × Σ(derth × percent) / 100.
        </p>
        {positions === undefined || voters === undefined ? (
          <div className={styles.empty}>Loading…</div>
        ) : positions === null || voters === null ? (
          <div className={styles.empty}>Could not load positions.</div>
        ) : byValidator.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Validator</th>
                <th>Positions</th>
                <th>Weight</th>
                <th>Per option</th>
              </tr>
            </thead>
            <tbody>
              {byValidator.map((r) => (
                <tr key={r.validator}>
                  <td className={styles.mono}>{monikers[r.validator] || short(r.validator, 14, 6)}</td>
                  <td>
                    {r.count.toLocaleString()}
                    <div className={styles.muted}>{formatMacro(r.derth, UERTH)} derth</div>
                  </td>
                  <td>{r.voter ? erth(r.voter.weight) : "—"}</td>
                  <td>
                    {r.voter?.optionWeights.length
                      ? r.voter.optionWeights.map((w) => (
                          <div key={w.optionId}>
                            {erth(w.weight)} {optionName(w.optionId)}
                          </div>
                        ))
                      : <span className={styles.muted}>No live split</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>No positions yet.</div>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Positions</h3>
        {positions === undefined ? (
          <div className={styles.empty}>Loading…</div>
        ) : positions === null ? (
          <div className={styles.empty}>Could not load positions.</div>
        ) : positions.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>#</th>
                <th>Validator</th>
                <th>Weight</th>
                <th>Split</th>
              </tr>
            </thead>
            <tbody>
              {positions.map((p) => (
                <tr key={p.id}>
                  <td>{p.id}</td>
                  <td className={styles.mono}>{monikers[p.validator] || short(p.validator, 14, 6)}</td>
                  <td>
                    {/* Filled in by the query: derth x epoch rate while the split is live. */}
                    {erth(p.weight)}
                    <div className={styles.muted}>{formatMacro(p.derth, UERTH)} derth</div>
                    {lapsed(p) && (
                      <div className={styles.muted}>Lapsed at a reset; the owner votes again in the app</div>
                    )}
                  </td>
                  <td>
                    {p.splits.length
                      ? p.splits.map((s) => (
                          <div key={s.optionId}>
                            {s.percent}% {optionName(s.optionId)}
                          </div>
                        ))
                      : <span className={styles.muted}>Unallocated</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>No positions yet.</div>
        )}
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Removal ballots</h3>
        {ballots === undefined ? (
          <div className={styles.empty}>Loading…</div>
        ) : ballots === null ? (
          <div className={styles.empty}>Could not load removal ballots.</div>
        ) : ballots.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Option</th>
                <th>Yes</th>
                <th>No</th>
                <th>Closes</th>
              </tr>
            </thead>
            <tbody>
              {ballots.map((b) => (
                <tr key={b.ballotId}>
                  <td>{optionName(b.optionId)}</td>
                  <td>{b.yes.toLocaleString()}</td>
                  <td>{b.no.toLocaleString()}</td>
                  <td className={styles.muted}>{when(b.closesAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>
            No open ballots. Registered humans can open and vote on one from the mobile app;
            two thirds of the votes cast strikes the option.
          </div>
        )}
      </div>
    </div>
  );
};

export default GroundworksFund;
