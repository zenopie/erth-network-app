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
 * caretaker_vote_seconds unless their owner casts again (renewal is manual;
 * the app reminds them). So this page shows
 * the public outcome (each option's weight, how many splits count) and has
 * nothing to sign except triggering an ADDRESS option's payout.
 */
const CaretakerFund = () => {
  const { address } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, error: txError, txHash, execute, closeModal } = useTransaction();
  const [view, setView] = useState(undefined);
  const [voters, setVoters] = useState(null);
  const [humans, setHumans] = useState(null);
  const [leaseDays, setLeaseDays] = useState(null);
  const [switchDays, setSwitchDays] = useState(null);

  const load = useCallback(async () => {
    showLoading();
    try {
      const [v, c, h, p, b] = await Promise.all([
        allocation.streamView(allocation.STREAM_CARETAKER),
        personhood.caretakerVoterCount(),
        personhood.registrationCount(),
        personhood.params(),
        personhood.leaseBounds(),
      ]);
      setView(v);
      setVoters(c);
      setHumans(h);
      setLeaseDays(p ? Math.round(p.caretakerVoteSeconds / 86400) : null);
      setSwitchDays(personhood.switchWaitDays(b, "caretaker"));
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
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} txHash={txHash} />

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
        can tell which split is yours. A split counts for {leaseDays ?? "R"} days; renew it in the
        app before then (it reminds you; nothing renews on its own). A split can never be handed to
        anyone else&apos;s identity: every registration proves its identity&apos;s secret, so only
        your own identities can follow yours. After you switch identity or renew your registration
        (which uses your wallet&apos;s next identity, from the same recovery phrase), the app can
        move the split to your new identity, and only there. Within one wallet the phrase is
        enough; from another wallet, both must be on the phone. Move before the split&apos;s lease
        ends: only a live split moves, and the old identity can no longer renew it. The app suggests
        a random time to move, at least 3 days before that, and never moves on its own. So renew
        your split before your registration&apos;s year ends, and before you switch if its lease
        ends soon. Without a move (or if the old phrase is lost), the old
        identity&apos;s split keeps counting, unchangeable, until it lapses, and casting again is a
        new split: a passport that replaced another (a switch or renewal) waits until anything its
        predecessor cast could have lapsed
        {switchDays ? ` (up to ${switchDays} days)` : ""}.
      </MobileCta>

      <div className={page.chart}>
        <AllocationFund
          title="Caretaker Fund"
          stream={allocation.STREAM_CARETAKER}
          options={options}
          totalWeight={view?.totalWeight}
          partial={Boolean(view?.partial)}
        />
      </div>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Options</h3>
        <AllocationOptionsTable
          options={options}
          address={address}
          onClaim={claim}
          totalWeight={view?.totalWeight}
          partial={Boolean(view?.partial)}
        />
      </div>
    </div>
  );
};

export default CaretakerFund;
