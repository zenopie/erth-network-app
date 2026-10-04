import React, { useCallback, useEffect, useState } from "react";
import countries from "i18n-iso-countries";
import enLocale from "i18n-iso-countries/langs/en.json";
import styles from "./Explorer.module.css";
import forms from "./Forms.module.css";
import * as gov from "../chain/gov";
import * as assembly from "../chain/assembly";
import * as shieldedStaking from "../chain/shieldedStaking";
import * as staking from "../chain/staking";
import { broadcast } from "../chain/tx";
import { UERTH } from "../chain/config";
import { amountOk, toMacro, toMicro } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import StatusModal from "../components/StatusModal";
import MobileCta from "../components/MobileCta";
import { short } from "../components/ExplorerBits";
import AmountNote from "../components/AmountNote";

countries.registerLocale(enLocale);

const STATUS = {
  PROPOSAL_STATUS_DEPOSIT_PERIOD: ["Deposit", ""],
  PROPOSAL_STATUS_VOTING_PERIOD: ["Voting", ""],
  PROPOSAL_STATUS_PASSED: ["Passed", "badgeSuccess"],
  PROPOSAL_STATUS_REJECTED: ["Rejected", "badgeFailed"],
  PROPOSAL_STATUS_FAILED: ["Failed", "badgeFailed"],
};

const erth = (micro) => `${toMacro(micro ?? 0, UERTH).toLocaleString()} ERTH`;
const date = (iso) => (iso && !iso.startsWith("0001") ? new Date(iso).toLocaleString() : "—");
const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : "—");

/**
 * Governance: x/gov proposals and both of the chambers that decide them.
 *
 * A proposal passes only if the stake chamber (x/gov's tally: validators'
 * self-bond plus private derth, voted with a stake-note proof against the
 * proposal's snapshot stake root) AND the human chamber (x/assembly: two thirds of the
 * human votes cast, three quarters when expedited, no quorum) approve it.
 * Human votes and private stake votes are proofs made on the phone; what a
 * Keplr account can still do is deposit, submit a text proposal, and — for a
 * validator operator — cast the transparent stake vote, which also carries
 * that validator's un-voted private stake.
 */
const Governance = () => {
  const { address, isConnected } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, error: txError, txHash, execute, closeModal } = useTransaction();
  const [list, setList] = useState(undefined);
  const [params, setParams] = useState(null);
  const [isOperator, setIsOperator] = useState(false);
  const [expanded, setExpanded] = useState(null);

  const load = useCallback(async () => {
    showLoading();
    try {
      const [ps, pr] = await Promise.all([gov.proposals(), gov.params()]);
      setList(ps);
      setParams(pr);
    } finally {
      hideLoading();
    }
  }, [showLoading, hideLoading]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!address) {
      setIsOperator(false);
      return;
    }
    staking
      .operatorView(address)
      .then((op) => setIsOperator(Boolean(op)))
      .catch(() => setIsOperator(false));
  }, [address]);

  const run = (build) =>
    execute(async () => {
      await broadcast(await build());
      await load();
    });

  const voting = (list ?? []).filter((p) => p.status === "PROPOSAL_STATUS_VOTING_PERIOD").length;

  return (
    <div className={styles.page}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} txHash={txHash} />

      <div className={styles.header}>
        <h2 className={styles.title}>Governance</h2>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Proposals</span>
          <span className={styles.statValue}>{list ? list.length.toLocaleString() : "—"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>In voting</span>
          <span className={styles.statValue}>{list ? voting : "—"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Minimum deposit</span>
          <span className={styles.statValue}>{params ? erth(params.minDeposit) : "—"}</span>
        </div>
      </div>

      <MobileCta title="Vote in the Earth Wallet app">
        Every proposal needs both chambers. As a registered human you cast one anonymous vote in
        the assembly; as a private staker your derth votes in the stake chamber. Both are proofs
        made on your phone.
      </MobileCta>

      {list === undefined ? (
        <div className={styles.card}>
          <div className={styles.empty}>Loading proposals…</div>
        </div>
      ) : list === null ? (
        <div className={styles.card}>
          <div className={styles.empty}>Could not load proposals.</div>
        </div>
      ) : list.length === 0 ? (
        <div className={styles.card}>
          <div className={styles.empty}>No proposals yet.</div>
        </div>
      ) : (
        list.map((p) => (
          <ProposalCard
            key={p.id}
            proposal={p}
            open={expanded === p.id}
            onToggle={() => setExpanded(expanded === p.id ? null : p.id)}
            address={address}
            isConnected={isConnected}
            isOperator={isOperator}
            run={run}
          />
        ))
      )}

      {isConnected && <NewProposal address={address} minDeposit={params?.minDeposit} run={run} />}
    </div>
  );
};

const ProposalCard = ({ proposal: p, open, onToggle, address, isConnected, isOperator, run }) => {
  const [detail, setDetail] = useState(null);
  const [deposit, setDeposit] = useState("");
  const isVoting = p.status === "PROPOSAL_STATUS_VOTING_PERIOD";
  const isDeposit = p.status === "PROPOSAL_STATUS_DEPOSIT_PERIOD";
  const [label, tone] = STATUS[p.status] ?? [p.status.replace("PROPOSAL_STATUS_", ""), ""];

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const [stake, human, inputs, snap, mine] = await Promise.all([
        isVoting ? gov.tally(p.id) : Promise.resolve(p.finalTally),
        // The chain keeps the human tally only while the round is open: the
        // round's end removes its ballot, after which the query answers a
        // zero tally (approved=false) whatever the outcome. No result is
        // kept in state, so a closed round shows no tally at all.
        isVoting ? assembly.proposalTally(p.id) : Promise.resolve(null),
        isVoting ? assembly.ballotInputs({ proposalId: p.id }) : Promise.resolve(null),
        isDeposit ? Promise.resolve(null) : shieldedStaking.snapshot(p.id),
        address && !isDeposit ? gov.vote(p.id, address) : Promise.resolve(null),
      ]);
      if (!cancelled) setDetail({ stake, human, inputs, snap, mine });
    })().catch(console.error);
    return () => {
      cancelled = true;
    };
  }, [open, p.id, p.finalTally, isVoting, isDeposit, address]);

  return (
    <div className={styles.card}>
      <div className={forms.proposalHead} onClick={onToggle}>
        <div>
          <div className={forms.proposalTitle}>
            #{p.id} {p.title}
          </div>
          <div className={styles.muted} style={{ fontSize: 13 }}>
            {isDeposit
              ? `Deposit ends ${date(p.depositEndTime)}`
              : `Voting ${isVoting ? "ends" : "ended"} ${date(p.votingEndTime)}`}
            {p.expedited && " · expedited"}
          </div>
        </div>
        <span className={`${styles.badge} ${tone ? styles[tone] : ""}`}>{label}</span>
      </div>

      {open && (
        <div className={forms.section}>
          {p.summary && <p className={forms.note}>{p.summary}</p>}
          <div className={styles.kv}>
            <div className={styles.kvLabel}>Messages</div>
            <div className={styles.kvValue}>
              {p.messages.length ? p.messages.map((m, i) => <span key={i} className={styles.badge}>{m}</span>) : "Text only"}
            </div>
          </div>
          <div className={styles.kv}>
            <div className={styles.kvLabel}>Proposer</div>
            <div className={`${styles.kvValue} ${styles.mono}`}>{short(p.proposer, 14, 6) || "—"}</div>
          </div>
          <div className={styles.kv}>
            <div className={styles.kvLabel}>Deposit</div>
            <div className={styles.kvValue}>{erth(p.totalDeposit)}</div>
          </div>

          {!isDeposit && (
            <>
              <StakeTally tally={detail?.stake} final={!isVoting} />
              {isVoting ? (
                <HumanTally tally={detail?.human} expedited={p.expedited} />
              ) : (
                <ClosedHumanTally />
              )}
              {isVoting && <Exclusions inputs={detail?.inputs} />}
              <Snapshot snap={detail?.snap} />
            </>
          )}

          {isConnected && isVoting && (
            <div className={forms.section}>
              <h4 className={forms.sectionTitle}>Transparent stake vote</h4>
              <p className={forms.note}>
                {isOperator
                  ? "Your vote weighs your self-bond, plus your validator's private stake that has not voted itself."
                  : "Only a validator operator's self-bond carries weight here; this account has none. Vote privately from the mobile app."}
                {detail?.mine && ` You voted: ${detail.mine.map((o) => o.option.replace("VOTE_OPTION_", "")).join(", ")}.`}
              </p>
              <div className={forms.formRow}>
                {[
                  ["Yes", gov.VOTE_YES],
                  ["No", gov.VOTE_NO],
                  ["No with veto", gov.VOTE_NO_WITH_VETO],
                  ["Abstain", gov.VOTE_ABSTAIN],
                ].map(([name, option]) => (
                  <button
                    key={option}
                    className={forms.button}
                    disabled={!isOperator}
                    onClick={() => run(() => [gov.msgVote(address, p.id, option)])}
                  >
                    {name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {isConnected && isDeposit && (
            <div className={forms.section}>
              <div className={forms.formRow}>
                <div className={forms.field}>
                  <label className={forms.label}>Add to the deposit (ERTH)</label>
                  <input
                    className={forms.input}
                    inputMode="decimal"
                    placeholder="0.0"
                    value={deposit}
                    onChange={(e) => setDeposit(e.target.value)}
                  />
                </div>
                <AmountNote value={deposit} denom={UERTH} />
                <button
                  className={forms.button}
                  style={{ alignSelf: "flex-end" }}
                  disabled={!amountOk(deposit, UERTH)}
                  onClick={() => run(() => [gov.msgDeposit(address, p.id, toMicro(deposit, UERTH))])}
                >
                  Deposit
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

const StakeTally = ({ tally, final }) => {
  if (!tally) return null;
  const n = (k) => Number(tally[k] ?? 0);
  const total = n("yes") + n("no") + n("noWithVeto") + n("abstain");
  return (
    <div className={forms.section}>
      <h4 className={forms.sectionTitle}>Stake chamber {final ? "(final)" : "(live)"}</h4>
      <div className={forms.bar}>
        <div className={forms.barYes} style={{ width: pct(n("yes"), total) }} />
        <div className={forms.barNo} style={{ width: pct(n("no"), total) }} />
        <div className={forms.barVeto} style={{ width: pct(n("noWithVeto"), total) }} />
        <div className={forms.barAbstain} style={{ width: pct(n("abstain"), total) }} />
      </div>
      <div className={forms.tallyLegend}>
        <span>Yes {erth(n("yes"))}</span>
        <span>No {erth(n("no"))}</span>
        <span>Veto {erth(n("noWithVeto"))}</span>
        <span>Abstain {erth(n("abstain"))}</span>
      </div>
    </div>
  );
};

/** A closed round: the chain does not keep its human tally, so none is shown. */
const ClosedHumanTally = () => (
  <div className={forms.section}>
    <h4 className={forms.sectionTitle}>Human chamber</h4>
    <p className={forms.note}>
      The chain keeps the human tally only while voting is open, so a finished proposal's human votes are not shown.
      The proposal's status above is the outcome of both chambers.
    </p>
  </div>
);

/** The live human tally of a proposal in voting. */
const HumanTally = ({ tally, expedited }) => {
  if (tally === undefined) return null;
  if (tally === null) {
    return (
      <div className={forms.section}>
        <h4 className={forms.sectionTitle}>Human chamber</h4>
        <p className={forms.note}>No human tally recorded.</p>
      </div>
    );
  }
  const total = tally.yes + tally.no;
  return (
    <div className={forms.section}>
      <h4 className={forms.sectionTitle}>
        Human chamber{" "}
        <span className={`${styles.badge} ${tally.approved ? styles.badgeSuccess : ""}`}>
          {tally.approved ? "Clears the bar" : "Below the bar"}
        </span>
      </h4>
      <div className={forms.bar}>
        <div className={forms.barYes} style={{ width: pct(tally.yes, total) }} />
        <div className={forms.barNo} style={{ width: pct(tally.no, total) }} />
      </div>
      <div className={forms.tallyLegend}>
        <span>Yes {tally.yes.toLocaleString()}</span>
        <span>No {tally.no.toLocaleString()}</span>
        <span>Needs {expedited ? "three quarters" : "two thirds"} of votes cast; no quorum</span>
      </div>
    </div>
  );
};

/**
 * Who may not vote on this proposal: the registrations it is about. A
 * proposal revoking one passport signer excludes that signer's
 * registrations; one revoking a country's signers or CSCAs excludes that
 * country. A proposal spanning countries has no ballot at all (the read
 * fails) and must be split.
 */
const Exclusions = ({ inputs }) => {
  if (inputs === undefined) return null;
  return (
    <div className={forms.section}>
      <h4 className={forms.sectionTitle}>Human ballot</h4>
      {inputs === null ? (
        <p className={forms.note}>
          No ballot is open for this proposal. If it revokes certificates from more than one
          country, the assembly cannot vote on it and it has to be split per country.
        </p>
      ) : (
        <>
          <div className={styles.kv}>
            <div className={styles.kvLabel}>Excluded country</div>
            <div className={styles.kvValue}>
              {inputs.excludedCountry
                ? `${countries.getName(inputs.excludedCountry, "en") ?? inputs.excludedCountry} (${inputs.excludedCountry})`
                : "None"}
            </div>
          </div>
          <div className={styles.kv}>
            <div className={styles.kvLabel}>Excluded signer</div>
            <div className={`${styles.kvValue} ${styles.mono}`}>
              {inputs.excludedDsc ? short(inputs.excludedDsc, 12, 8) : "None"}
            </div>
          </div>
          <div className={styles.kv}>
            <div className={styles.kvLabel}>Eligible</div>
            <div className={styles.kvValue}>
              {inputs.maxActivation !== null && <>Registered by {new Date(inputs.maxActivation * 1000).toLocaleString()}. </>}
              {inputs.maxPredecessor !== null
                ? <>An identity that replaced another (a switch or re-entry) after {new Date(inputs.maxPredecessor * 1000).toLocaleString()} cannot vote on it.</>
                : inputs.maxActivation === null && "Every live registration."}
              {inputs.round > 0 && (
                <span className={styles.muted}>
                  {" "}
                  · round {inputs.round + 1}: a new ballot (its own vote scope) after the expedited
                  round, so votes cast before do not carry over; vote again in the app.
                </span>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

const Snapshot = ({ snap }) => {
  if (!snap) return null;
  return (
    <div className={forms.section}>
      <h4 className={forms.sectionTitle}>Private stake snapshot</h4>
      <p className={forms.note}>
        Taken at height {snap.height.toLocaleString()} when voting opened. Private stake votes are
        proven against this note-tree root, so only stake held then can vote.
      </p>
      {snap.validators.length > 0 && (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Validator</th>
              <th>derth</th>
              <th>Rate</th>
            </tr>
          </thead>
          <tbody>
            {snap.validators.map((v) => (
              <tr key={v.validator}>
                <td className={styles.mono}>{short(v.validator, 16, 6)}</td>
                <td>{toMacro(v.supply, UERTH).toLocaleString()}</td>
                <td>{v.rate.toFixed(6)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const NewProposal = ({ address, minDeposit, run }) => {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [deposit, setDeposit] = useState("");

  return (
    <div className={styles.card}>
      <div className={forms.proposalHead} onClick={() => setOpen(!open)}>
        <h3 className={styles.cardTitle} style={{ margin: 0 }}>New text proposal</h3>
        <i className={`bx ${open ? "bx-chevron-up" : "bx-chevron-down"}`} aria-hidden="true"></i>
      </div>
      {open && (
        <div className={forms.section}>
          <p className={forms.note}>
            A signalling proposal with no messages. Proposals that execute messages are built with
            the CLI. Voting opens once the deposit reaches {minDeposit ? erth(minDeposit) : "the minimum"}.
          </p>
          <div className={forms.formRow}>
            <div className={forms.field}>
              <label className={forms.label}>Title</label>
              <input className={forms.input} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
          </div>
          <div className={forms.formRow}>
            <div className={forms.field}>
              <label className={forms.label}>Summary</label>
              <textarea className={forms.textarea} value={summary} onChange={(e) => setSummary(e.target.value)} />
            </div>
          </div>
          <div className={forms.formRow}>
            <div className={forms.field}>
              <label className={forms.label}>Initial deposit (ERTH)</label>
              <input className={forms.input} inputMode="decimal" placeholder="0.0" value={deposit} onChange={(e) => setDeposit(e.target.value)} />
            </div>
            <AmountNote value={deposit} denom={UERTH} />
            <button
              className={forms.button}
              style={{ alignSelf: "flex-end" }}
              disabled={!title.trim() || !summary.trim() || !amountOk(deposit, UERTH)}
              onClick={() =>
                run(() => [
                  gov.msgSubmitTextProposal(address, title.trim(), summary.trim(), toMicro(deposit, UERTH)),
                ])
              }
            >
              Submit
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default Governance;
