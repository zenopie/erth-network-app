import React, { useCallback, useEffect, useState } from "react";
import styles from "./Explorer.module.css";
import page from "./CaretakerFund.module.css";
import AllocationFund from "../components/AllocationFund";
import AllocationOptionsTable from "../components/AllocationOptionsTable";
import MobileCta from "../components/MobileCta";
import StatusModal from "../components/StatusModal";
import * as allocation from "../chain/allocation";
import * as personhood from "../chain/personhood";
import { broadcast } from "../chain/tx";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";

const fmt = (n) => (n === null || n === undefined ? "—" : n.toLocaleString());

/**
 * The Caretaker Fund: x/allocation's one-human-one-vote stream.
 *
 * Splits are cast anonymously from the mobile app — a membership proof filed
 * under a caretaker nullifier, not an address — and lapse after
 * caretaker_vote_seconds unless the app refreshes them. So this page shows
 * the public outcome (each option's weight, how many splits count) and has
 * nothing to sign except triggering an ADDRESS option's payout.
 */
const CaretakerFund = () => {
  const { address } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, error: txError, execute, closeModal } = useTransaction();
  const [view, setView] = useState(undefined);
  const [voters, setVoters] = useState(null);
  const [humans, setHumans] = useState(null);
  const [leaseDays, setLeaseDays] = useState(null);

  const load = useCallback(async () => {
    showLoading();
    try {
      const [v, c, h, p] = await Promise.all([
        allocation.streamView(allocation.STREAM_CARETAKER),
        personhood.caretakerVoterCount(),
        personhood.registrationCount(),
        personhood.params(),
      ]);
      setView(v);
      setVoters(c);
      setHumans(h);
      setLeaseDays(p ? Math.round(p.caretakerVoteSeconds / 86400) : null);
    } finally {
      hideLoading();
    }
  }, [showLoading, hideLoading]);

  useEffect(() => {
    load();
  }, [load]);

  const claim = (o) =>
    execute(async () => {
      await broadcast([allocation.msgClaimAllocation(address, allocation.STREAM_CARETAKER, o.id)]);
      load();
    });

  const options = view === undefined ? [] : (view?.options ?? null);

  return (
    <div className={styles.page}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} />

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Splits counting</span>
          <span className={styles.statValue}>{fmt(voters)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Registered humans</span>
          <span className={styles.statValue}>{fmt(humans)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Turnout</span>
          <span className={styles.statValue}>
            {voters !== null && humans ? `${((voters / humans) * 100).toFixed(1)}%` : "—"}
          </span>
        </div>
      </div>

      <MobileCta title="Cast your caretaker split in the Earth Wallet app">
        One registered human, one vote, cast anonymously with a proof made on your phone. Nobody
        can tell which split is yours. A split counts for {leaseDays ?? "R"} days and the app
        renews it for you.
      </MobileCta>

      <div className={page.chart}>
        <AllocationFund title="Caretaker Fund" stream={allocation.STREAM_CARETAKER} options={options} />
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Options</h3>
        <AllocationOptionsTable options={options} address={address} onClaim={claim} />
      </div>
    </div>
  );
};

export default CaretakerFund;
