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
import { toMacro } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";

const erth = (micro) => `${toMacro(micro, UERTH).toLocaleString()} ERTH`;
const when = (unix) => (unix ? new Date(unix * 1000).toLocaleString() : "—");

/**
 * The Groundworks Fund: x/allocation's stake-weighted stream.
 *
 * Its weight is almost all Groundworks positions — private derth locked in
 * x/shieldedstaking and split across options. Its owner is known only by an
 * owner tag its stake proofs reproduce, so each position's split and weight
 * are public and its owner is not. The rest is
 * validators' transparent self-bond, which an operator can still direct here
 * with Keplr. The assembly (one human, one vote) can strike an option; its
 * open removal ballots are listed at the bottom.
 */
const GroundworksFund = () => {
  const { address } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, error: txError, execute, closeModal } = useTransaction();
  const [view, setView] = useState(undefined);
  const [positions, setPositions] = useState(undefined);
  const [ballots, setBallots] = useState(undefined);
  const [monikers, setMonikers] = useState({});

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
  const positionWeight = (positions ?? []).reduce((s, p) => s + Number(p.weight), 0);
  const totalWeight = Number(view?.totalWeight ?? 0);

  return (
    <div className={styles.page}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} />

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
            {positions && totalWeight > 0
              ? `${Math.min(100, (positionWeight / totalWeight) * 100).toFixed(1)}%`
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
          onChanged={load}
        />
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Options</h3>
        <AllocationOptionsTable options={options} address={address} onClaim={claim} />
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
                    {erth(p.weight)}
                    <div className={styles.muted}>{toMacro(p.derth, UERTH).toLocaleString()} derth</div>
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
