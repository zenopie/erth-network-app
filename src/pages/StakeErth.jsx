import React, { useCallback, useEffect, useState } from "react";
import * as staking from "../chain/staking";
import * as shieldedStaking from "../chain/shieldedStaking";
import * as allocation from "../chain/allocation";
import * as explorer from "../chain/explorer";
import { balance } from "../chain/bank";
import { broadcast } from "../chain/tx";
import { UERTH } from "../chain/config";
import { formatUnits, toMacro, toMicro } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import styles from "./Explorer.module.css";
import forms from "./Forms.module.css";
import head from "./StakeErth.module.css";
import StatusModal from "../components/StatusModal";
import MobileCta from "../components/MobileCta";

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

// The chain emits a flat 1 ERTH/sec as the base staking reward, so a staker's
// yearly return per staked ERTH is seconds-per-year / total staked. Private
// stakers receive it as a rising derth rate rather than as payouts.
const calculateAPR = (totalStakedMicro) => {
  const total = toMacro(totalStakedMicro ?? 0, UERTH);
  return total ? SECONDS_PER_YEAR / total : 0;
};

const erth = (micro) => `${toMacro(micro ?? 0, UERTH).toLocaleString()} ERTH`;

/** "in 5h 12m" until a unix time, or "now" once it has passed. */
function until(unix) {
  const s = Math.floor(unix - Date.now() / 1000);
  if (s <= 0) return "now";
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `in ${h}h ${m}m` : `in ${m}m`;
}

/**
 * Staking.
 *
 * x/shieldedstaking is the only delegator on this chain besides validators'
 * own operators. Holders stake privately from the mobile app: they spend ERTH
 * notes for derth/<validator> stake notes (owner-locked, non-transferable, in
 * the module's own stake tree; derth is not a coin), the module delegates the batch at the end
 * of each epoch, and rewards compound into each validator's rate instead of
 * being paid out. This page shows that public side — the validators, each
 * one's rate and derth supply, the epoch clock — and gives a validator's
 * operator the transparent self-bond operations Keplr can still sign.
 */
const StakeErth = () => {
  const { address, isConnected } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, error: txError, execute, closeModal } = useTransaction();

  const [totalBonded, setTotalBonded] = useState(null);
  const [unbondDays, setUnbondDays] = useState(21);
  const [epoch, setEpoch] = useState(null);
  const [validators, setValidators] = useState(null);
  const [books, setBooks] = useState({});
  const [gw, setGw] = useState({});
  const [operator, setOperator] = useState(null);
  const [liquid, setLiquid] = useState("0");

  const loadNetwork = useCallback(async () => {
    showLoading();
    try {
      const [bonded, days, ep, vals] = await Promise.all([
        staking.totalBonded(),
        staking.unbondingDays(),
        shieldedStaking.epoch(),
        explorer.validators().catch(() => null),
      ]);
      setTotalBonded(bonded);
      setUnbondDays(days);
      setEpoch(ep);
      const list = (vals?.validators ?? [])
        .filter((v) => v.bonded || Number(v.tokens) > 0)
        // Smallest first: nudge private stake away from the top validator.
        .sort((a, b) => a.votingPower - b.votingPower);
      setValidators(vals ? list : null);
      const ops = list.map((v) => v.operator);
      const [bk, voters] = await Promise.all([
        shieldedStaking.validatorBooks(ops),
        // Each validator's Groundworks positions, as the one weighted voter
        // the stream counts them as.
        allocation.validatorVoters(ops),
      ]);
      setBooks(bk);
      setGw(voters);
    } finally {
      hideLoading();
    }
  }, [showLoading, hideLoading]);

  const loadOperator = useCallback(async () => {
    if (!address) {
      setOperator(null);
      setLiquid("0");
      return;
    }
    const [op, bal] = await Promise.all([staking.operatorView(address), balance(address, UERTH)]);
    setOperator(op);
    setLiquid(bal);
  }, [address]);

  useEffect(() => {
    loadNetwork();
  }, [loadNetwork]);

  useEffect(() => {
    loadOperator().catch(console.error);
  }, [loadOperator]);

  const run = (build, opts) =>
    execute(async () => {
      await broadcast(await build(), opts);
      await Promise.all([loadOperator(), loadNetwork()]);
    });

  const privatelyStaked = Object.values(books).reduce(
    (s, b) => s + (b ? Number(b.backing) : 0),
    0,
  );
  const apr = calculateAPR(totalBonded);

  return (
    <div className={styles.page}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} />

      <div className={head.header}>
        <div className={head.headerLeft}>
          <img src="/images/coin/ERTH.png" alt="ERTH" className={head.headerLogo} />
          <div>
            <span className={head.headerLabel}>ERTH Staking</span>
            <span className={head.headerApr}>{(apr * 100).toFixed(1)}% APR</span>
          </div>
        </div>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Total bonded</span>
          <span className={styles.statValue}>{totalBonded !== null ? erth(totalBonded) : "—"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Staked privately</span>
          <span className={styles.statValue}>{validators ? erth(privatelyStaked) : "—"}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Epoch</span>
          <span className={styles.statValue}>
            {epoch ? `#${epoch.number}` : "—"}
            {epoch && <span className={styles.muted} style={{ fontSize: 13 }}> ends {until(epoch.endTime)}</span>}
          </span>
        </div>
      </div>

      <MobileCta title="Stake privately in the Earth Wallet app">
        Staking, unstaking, claiming and stake votes are private: your ERTH becomes
        derth for the validator you choose, worth more ERTH each epoch as rewards compound. derth stays
        in your wallet: it cannot be sent or traded. Delegations settle at the end of each epoch; unstaking takes {unbondDays} days.
      </MobileCta>

      <div className={styles.card}>
        <h3 className={styles.cardTitle}>Validators</h3>
        {validators === null ? (
          <div className={styles.empty}>Could not load validators.</div>
        ) : validators.length ? (
          <table className={styles.table}>
            <thead>
              <tr>
                <th>Validator</th>
                <th>Power</th>
                <th>Comm.</th>
                <th>Uptime</th>
                <th>Rate</th>
                <th>Private stake</th>
                <th title="Its Groundworks positions, weighed together as one voter">Groundworks</th>
                <th>Next epoch</th>
              </tr>
            </thead>
            <tbody>
              {validators.map((v) => {
                const b = books[v.operator];
                const pendIn = Number(b?.pendingDelegation ?? 0);
                const pendOut = Number(b?.pendingUndelegation ?? 0);
                return (
                  <tr key={v.operator}>
                    <td>
                      {v.moniker || <span className={styles.mono}>{v.operator.slice(0, 20)}…</span>}
                      {v.jailed && <span className={`${styles.badge} ${styles.badgeFailed}`}>Jailed</span>}
                      {!v.bonded && !v.jailed && <span className={styles.badge}>Unbonded</span>}
                      {v.votingPower >= 33 && (
                        <div className={forms.warn} style={{ margin: 0 }}>
                          Over a third of stake: can halt the chain alone
                        </div>
                      )}
                    </td>
                    <td>{v.votingPower.toFixed(1)}%</td>
                    <td>{(v.commission * 100).toFixed(0)}%</td>
                    <td>{v.uptime !== null ? `${v.uptime.toFixed(1)}%` : "—"}</td>
                    <td title="ERTH per derth: live, and as of the last epoch end">
                      {b ? b.rate.toFixed(6) : "—"}
                      {b && <div className={styles.muted}>epoch {b.epochRate.toFixed(6)}</div>}
                    </td>
                    <td>
                      {b ? erth(b.backing) : "—"}
                      {b && (
                        <div className={styles.muted}>
                          {toMacro(b.supply, UERTH).toLocaleString()} derth
                        </div>
                      )}
                    </td>
                    <td title="rate × Σ(derth × percent) / 100 over its live positions">
                      {gw[v.operator] && Number(gw[v.operator].weight) > 0 ? erth(gw[v.operator].weight) : "—"}
                    </td>
                    <td className={styles.muted}>
                      {pendIn || pendOut ? (
                        <>
                          {pendIn > 0 && <div>+{erth(pendIn)}</div>}
                          {pendOut > 0 && <div>−{erth(pendOut)}</div>}
                        </>
                      ) : (
                        "—"
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : (
          <div className={styles.empty}>No validators.</div>
        )}
        <p className={forms.note}>
          Rate is ERTH per derth: what one derth of a validator redeems for. It rises as rewards
          compound and falls if the validator is slashed. Next epoch is the private stake queued to
          be delegated (+) or undelegated (−) when the epoch ends.
        </p>
      </div>

      {isConnected && operator && (
        <OperatorPanel
          operator={operator}
          liquid={liquid}
          unbondDays={unbondDays}
          address={address}
          run={run}
        />
      )}
      {isConnected && !operator && <CreateValidator address={address} liquid={liquid} run={run} />}
    </div>
  );
};

/**
 * A validator operator's self-bond: the one transparent delegation the chain
 * still accepts. Redelegation is refused even for operators (a self-bond moved
 * elsewhere would stop being one), so it is not offered.
 */
const OperatorPanel = ({ operator, liquid, unbondDays, address, run }) => {
  const [bondAmount, setBondAmount] = useState("");
  const [unbondAmount, setUnbondAmount] = useState("");
  const pending = Number(operator.rewards) + Number(operator.commissionEarned);

  return (
    <div className={styles.card}>
      <h3 className={styles.cardTitle}>Your validator: {operator.moniker || operator.operator}</h3>
      <div className={styles.kv}>
        <div className={styles.kvLabel}>Self-bond</div>
        <div className={styles.kvValue}>{erth(operator.selfBond)}</div>
      </div>
      <div className={styles.kv}>
        <div className={styles.kvLabel}>Total stake</div>
        <div className={styles.kvValue}>
          {erth(operator.tokens)} {operator.jailed && <span className={`${styles.badge} ${styles.badgeFailed}`}>Jailed</span>}
        </div>
      </div>
      <div className={styles.kv}>
        <div className={styles.kvLabel}>Rewards + commission</div>
        <div className={styles.kvValue}>
          {erth(operator.rewards)} + {erth(operator.commissionEarned)}{" "}
          <button
            className={forms.ghostButton}
            disabled={!(pending > 0)}
            onClick={() => run(() => staking.msgsWithdrawOperatorRewards(address))}
          >
            Withdraw
          </button>
        </div>
      </div>

      <div className={forms.section}>
        <div className={forms.formRow}>
          <div className={forms.field}>
            <label className={forms.label}>
              Bond more (balance {toMacro(liquid, UERTH).toLocaleString()} ERTH)
            </label>
            <input
              className={forms.input}
              type="number"
              placeholder="0.0"
              value={bondAmount}
              onChange={(e) => setBondAmount(e.target.value)}
            />
          </div>
          <button
            className={forms.button}
            style={{ alignSelf: "flex-end" }}
            disabled={!(parseFloat(bondAmount) > 0) || BigInt(toMicro(bondAmount, UERTH)) > BigInt(liquid)}
            onClick={() =>
              run(() => [staking.msgSelfBond(address, toMicro(bondAmount, UERTH))]).then(() =>
                setBondAmount(""),
              )
            }
          >
            Bond
          </button>
        </div>
        <div className={forms.formRow}>
          <div className={forms.field}>
            <label className={forms.label}>
              Unbond{" "}
              <button
                className={forms.ghostButton}
                onClick={() => setUnbondAmount(formatUnits(operator.selfBond, UERTH))}
              >
                Max
              </button>
            </label>
            <input
              className={forms.input}
              type="number"
              placeholder="0.0"
              value={unbondAmount}
              onChange={(e) => setUnbondAmount(e.target.value)}
            />
          </div>
          <button
            className={forms.button}
            style={{ alignSelf: "flex-end" }}
            disabled={
              !(parseFloat(unbondAmount) > 0) ||
              BigInt(toMicro(unbondAmount, UERTH)) > BigInt(operator.selfBond)
            }
            onClick={() =>
              run(() => [staking.msgSelfUnbond(address, toMicro(unbondAmount, UERTH))]).then(() =>
                setUnbondAmount(""),
              )
            }
          >
            Unbond
          </button>
        </div>
        <p className={forms.note}>
          {unbondDays}-day unbonding. Unbonding below the validator&apos;s minimum self-delegation
          jails it.
        </p>
      </div>

      {operator.unbonding.length > 0 && (
        <div className={forms.section}>
          <h4 className={forms.sectionTitle}>Unbonding</h4>
          {operator.unbonding.map((e) => (
            <div key={e.creationHeight} className={styles.kv}>
              <div className={styles.kvLabel}>{new Date(e.completionTime).toLocaleString()}</div>
              <div className={styles.kvValue}>
                {erth(e.balance)}{" "}
                <button
                  className={forms.ghostButton}
                  title="Return this stake to your validator now"
                  onClick={() => run(() => [staking.msgCancelSelfUnbonding(address, e)])}
                >
                  Cancel
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

/**
 * MsgCreateValidator from the connected account. Being a validator is a public
 * act, so it stays transparent and Keplr-signed; the node's consensus key comes
 * from `earthd comet show-validator`.
 */
const CreateValidator = ({ address, liquid, run }) => {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    moniker: "",
    website: "",
    details: "",
    consensusPubkey: "",
    selfBond: "",
    commissionRate: "0.05",
    commissionMaxRate: "0.20",
    commissionMaxChangeRate: "0.01",
  });
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  return (
    <div className={styles.card}>
      <div className={forms.proposalHead} onClick={() => setOpen(!open)}>
        <h3 className={styles.cardTitle} style={{ margin: 0 }}>Run a validator</h3>
        <i className={`bx ${open ? "bx-chevron-up" : "bx-chevron-down"}`} aria-hidden="true"></i>
      </div>
      <p className={forms.note}>
        This account operates no validator, so Keplr cannot stake from it: the chain accepts
        transparent delegations only from a validator&apos;s own operator. To stake as a holder,
        use the mobile app.
      </p>
      {open && (
        <div className={forms.section}>
          <div className={forms.formRow}>
            <div className={forms.field}>
              <label className={forms.label}>Moniker</label>
              <input className={forms.input} value={form.moniker} onChange={set("moniker")} />
            </div>
            <div className={forms.field}>
              <label className={forms.label}>Website</label>
              <input className={forms.input} value={form.website} onChange={set("website")} />
            </div>
          </div>
          <div className={forms.formRow}>
            <div className={forms.field}>
              <label className={forms.label}>Consensus public key (base64 ed25519)</label>
              <input
                className={`${forms.input} ${styles.mono}`}
                placeholder="earthd comet show-validator → key"
                value={form.consensusPubkey}
                onChange={set("consensusPubkey")}
              />
            </div>
          </div>
          <div className={forms.formRow}>
            <div className={forms.field}>
              <label className={forms.label}>
                Self-bond (balance {toMacro(liquid, UERTH).toLocaleString()} ERTH)
              </label>
              <input className={forms.input} type="number" value={form.selfBond} onChange={set("selfBond")} />
            </div>
            <div className={forms.field}>
              <label className={forms.label}>Commission / max / max daily change</label>
              <div className={forms.formRow} style={{ margin: 0 }}>
                <input className={forms.input} style={{ flex: 1, minWidth: 0 }} value={form.commissionRate} onChange={set("commissionRate")} />
                <input className={forms.input} style={{ flex: 1, minWidth: 0 }} value={form.commissionMaxRate} onChange={set("commissionMaxRate")} />
                <input className={forms.input} style={{ flex: 1, minWidth: 0 }} value={form.commissionMaxChangeRate} onChange={set("commissionMaxChangeRate")} />
              </div>
            </div>
          </div>
          <div className={forms.formRow}>
            <div className={forms.field}>
              <label className={forms.label}>Details</label>
              <textarea className={forms.textarea} value={form.details} onChange={set("details")} />
            </div>
          </div>
          <button
            className={forms.button}
            disabled={!form.moniker || !form.consensusPubkey || !(parseFloat(form.selfBond) > 0)}
            onClick={() =>
              run(() => [
                staking.msgCreateValidator(address, {
                  ...form,
                  selfBond: toMicro(form.selfBond, UERTH),
                }),
              ])
            }
          >
            Create validator
          </button>
        </div>
      )}
    </div>
  );
};

export default StakeErth;
