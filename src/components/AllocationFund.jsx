import React, { useState, useEffect } from "react";
import { PieChart, Pie, Cell, Legend } from "recharts";
import styles from "./AllocationFund.module.css";
import { useWallet } from "../contexts/WalletContext";
import { broadcast } from "../chain/tx";
import * as allocation from "../chain/allocation";
import StatusModal from "../components/StatusModal";
import useTransaction from "../hooks/useTransaction";
import { UERTH } from "../chain/config";
import { formatMacro, percentString, sumBig, toBigInt } from "../chain/tokens";

// Colors for the pie chart - earth/nature theme with distinct colors
const COLORS = ["#4CAF50", "#2196F3", "#FFC107", "#00BCD4", "#8E24AA", "#FF7043"];
const UNALLOCATED_COLOR = "#B0B0B0"; // Grey color for Unallocated

const renderCustomLegend = (props, data) => {
  const { payload } = props;
  const total = data.reduce((acc, entry) => acc + (entry.value || 0), 0);

  return (
    <ul
      style={{
        listStyleType: "none",
        margin: 0,
        padding: 0,
        display: "flex",
        flexWrap: "wrap",
        justifyContent: "center",
      }}
    >
      {payload.map((entry, index) => {
        const value = entry.payload.value || 0;
        const name = entry.payload.name || "N/A";
        const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : "0";
        const formattedPercentage = percentage.endsWith(".0") ? parseInt(percentage) : percentage;

        return (
          <li
            key={`item-${index}`}
            style={{
              margin: "0 10px",
              color: entry.color,
              whiteSpace: "nowrap",
            }}
          >
            {`${name} ${formattedPercentage}%`}
          </li>
        );
      })}
    </ul>
  );
};

// The operator's last live split, remembered per address in this browser:
// once a lease ends the chain drops the record (the LCD then 404s as for a
// never-cast split), so this is what tells "lapsed" from "never cast" and
// what a re-cast is prefilled from. A convenience only: unreadable storage
// just means no lapsed notice.
const memoryKey = (address) => `earth.groundworks.split.${address}`;
const recall = (address) => {
  try {
    const v = JSON.parse(localStorage.getItem(memoryKey(address)) ?? "null");
    return v && Array.isArray(v.splits) && Number.isSafeInteger(v.expiresAt) ? v : null;
  } catch {
    return null;
  }
};
const remember = (address, splits, expiresAt) => {
  try {
    localStorage.setItem(memoryKey(address), JSON.stringify({ splits, expiresAt }));
  } catch {
    // Storage unavailable: nothing to remember with.
  }
};

const DAY = 24 * 60 * 60;
const leaseText = (seconds) =>
  seconds === allocation.DEFAULT_GROUNDWORKS_LEASE_SECONDS ? "one year" : `${Math.round(seconds / DAY)} days`;
const dateText = (unix) => new Date(unix * 1000).toLocaleDateString();
const sameSplit = (a, b) =>
  a.length === b.length &&
  a.every((w) => b.some((x) => String(x.optionId) === String(w.optionId) && Number(x.percent) === Number(w.percent)));

const getChartDataWithUnallocated = (allocations = []) => {
  // Only valid shares (1..100) are drawn; an invalid entry is refused below.
  const totalPercentage = allocations.reduce((acc, alloc) => acc + (allocation.splitPercent(alloc.value) ?? 0), 0);
  const unallocatedPercentage = Math.max(100 - totalPercentage, 0);

  const chartData = allocations.map((alloc) => ({
    ...alloc,
    value: allocation.splitPercent(alloc.value) ?? 0,
  }));

  if (unallocatedPercentage > 0) {
    chartData.push({
      id: "unallocated",
      name: "Unallocated",
      value: unallocatedPercentage,
    });
  }

  return chartData;
};

/**
 * The allocation pie for one stream, plus — on Groundworks, for a connected
 * account — the transparent split editor.
 *
 * Caretaker splits are anonymous membership proofs made in the mobile app, so
 * that stream is read-only here. Groundworks is mostly weighted by private
 * positions (also made in the app), but a validator's own self-bond is still
 * transparent stake and its operator can direct it with MsgSetAllocations.
 * That split is leased (groundworks_lease_seconds, a year by default): the
 * editor shows when it stops counting, renews it by casting it again, and
 * says when it has lapsed. Renewal is the operator's own action, never
 * automatic.
 * `options` comes from the page so the pie and the page's table agree.
 */
const AllocationFund = ({ title, stream, options, streamEpoch = 0, onChanged, totalWeight, partial = false }) => {
  const { address, isConnected } = useWallet();
  const { isModalOpen, animationState, error: txError, txHash, execute, closeModal } = useTransaction();

  const editable = stream === allocation.STREAM_GROUNDWORKS && isConnected;

  const [activeTab, setActiveTab] = useState("Actual");
  const [selectedAllocations, setSelectedAllocations] = useState([]);
  const [voterWeight, setVoterWeight] = useState("0");
  // x/staking status of the account's own validator ("" when it runs none,
  // null until read). Outside BONDED it has no Groundworks weight.
  const [validatorStatus, setValidatorStatus] = useState(null);
  // { epoch } of a split filed before the stream's current epoch: shown, but
  // it no longer counts until set again.
  const [staleSplit, setStaleSplit] = useState(null);
  // The split's lease: { current: [{optionId, percent}], expiresAt, lapsed }
  // (null until read, or without a split cast from this account).
  const [lease, setLease] = useState(null);
  const [leaseSeconds, setLeaseSeconds] = useState(allocation.DEFAULT_GROUNDWORKS_LEASE_SECONDS);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const labelFor = (option) => `#${option.id} ${option.description || "Unknown"}`;
  const live = (options ?? []).filter((o) => !o.removed);
  const allocationOptions = live.map((o) => ({ id: o.id, name: labelFor(o) }));
  // The pie takes floats: each option's share of the total in percent, worked
  // out exactly from the integer weights first (they pass 2^53). The total is
  // the chain's stream total, so a partial option list leaves
  // its unread weight as its own slice rather than inflating the rest.
  const loadedTotal = sumBig(live.map((o) => o.amountAllocated));
  const liveTotal = toBigInt(totalWeight) > loadedTotal ? toBigInt(totalWeight) : loadedTotal;
  const dataActual = live
    .filter((o) => toBigInt(o.amountAllocated) > 0n)
    .map((o) => ({ id: o.id, name: labelFor(o), value: Number(percentString(o.amountAllocated, liveTotal, 4)) }));
  if (liveTotal > loadedTotal) {
    dataActual.push({ id: "unread", name: "Options not read", value: Number(percentString(liveTotal - loadedTotal, liveTotal, 4)) });
  }

  const totalPercentage = selectedAllocations.reduce(
    (acc, alloc) => acc + (allocation.splitPercent(alloc.value) ?? 0),
    0,
  );
  // Each share an integer 1..100, distinct, summing to 100:
  // the chain's ValidateSplit, checked before a fee is spent on it.
  const splitWeights = selectedAllocations.map((alloc) => ({ optionId: alloc.id, percent: alloc.value }));
  const splitProblem = allocation.splitProblem(splitWeights);

  useEffect(() => {
    if (!editable) setActiveTab("Actual");
  }, [editable]);

  useEffect(() => {
    if (!editable) return;
    let cancelled = false;
    allocation.groundworksLeaseSeconds().then((n) => !cancelled && setLeaseSeconds(n));
    return () => {
      cancelled = true;
    };
  }, [editable]);

  useEffect(() => {
    if (activeTab !== "Split" || !editable || !address) return;
    let cancelled = false;
    allocation
      .groundworksVoter(address, { streamEpoch })
      .then(({ splits: stored, weight, stale, epoch, exists, expired, expiresAt, validatorStatus: status }) => {
        if (cancelled) return;
        let splits = stored;
        const now = Date.now() / 1000;
        if (exists && expiresAt > 0) {
          if (!expired && !stale) remember(address, stored, expiresAt);
          setLease({ current: stored, expiresAt, lapsed: expired });
        } else if (!exists) {
          // Dropped at its lease end, or never cast: only a remembered lease
          // that has ended says which.
          const mem = recall(address);
          if (mem && mem.expiresAt <= now) {
            splits = mem.splits;
            setLease({ current: mem.splits, expiresAt: mem.expiresAt, lapsed: true });
          } else {
            setLease(null);
          }
        } else {
          setLease(null);
        }
        setVoterWeight(weight);
        setValidatorStatus(status);
        setStaleSplit(stale ? { epoch } : null);
        setSelectedAllocations(
          splits.map((w) => {
            const o = live.find((item) => item.id === w.optionId);
            return { id: w.optionId, name: o ? labelFor(o) : `#${w.optionId}`, value: w.percent };
          }),
        );
      })
      .catch((err) => {
        if (cancelled) return;
        // Unread is not "has weight": Save stays off until the weight is known.
        setVoterWeight("0");
        setValidatorStatus(null);
        setLease(null);
        console.error(`Error fetching split for ${title}:`, err);
      });
    return () => {
      cancelled = true;
    };
    // `live` is derived from `options`; depending on it directly would refetch
    // on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, editable, address, options, streamEpoch]);

  const addAllocation = (option) => {
    if (!option) return;
    const isDuplicate = selectedAllocations.some((alloc) => String(alloc.id) === String(option.id));
    if (!isDuplicate) {
      setSelectedAllocations([...selectedAllocations, { ...option, value: "" }]);
    }
    setShowDropdown(false);
  };

  const removeAllocation = (id) => {
    setSelectedAllocations(selectedAllocations.filter((alloc) => alloc.id !== id));
  };

  const handlePercentageChange = (id, value) => {
    setSelectedAllocations(
      selectedAllocations.map((alloc) =>
        // Kept as typed: a non-integer, zero or negative share stays visible
        // and blocks Set Allocation rather than being coerced.
        alloc.id === id ? { ...alloc, value: String(value) } : alloc,
      ),
    );
  };

  const handleSetAllocation = async () => {
    if (splitProblem) {
      await execute(async () => {
        throw new Error(splitProblem);
      });
      return;
    }
    setIsSubmitting(true);
    await execute(async () => {
      const weights = selectedAllocations.map((alloc) => ({
        optionId: Number(alloc.id),
        percent: allocation.splitPercent(alloc.value),
      }));
      await broadcast([allocation.msgSetAllocations(address, stream, weights)]);
      // The new lease runs from this block; the next read stores the
      // chain's exact expires_at.
      const expiresAt = Math.floor(Date.now() / 1000) + leaseSeconds;
      remember(address, weights, expiresAt);
      setLease({ current: weights, expiresAt, lapsed: false });
      onChanged?.();
    });
    setIsSubmitting(false);
  };

  return (
    <div className={styles.allocationFundBox}>
      <h2>{title}</h2>
      {editable && (
        <div className={styles.allocationFundTab}>
          <button className={activeTab === "Actual" ? styles.active : ""} onClick={() => setActiveTab("Actual")}>
            Actual Allocation
          </button>
          <button className={activeTab === "Split" ? styles.active : ""} onClick={() => setActiveTab("Split")}>
            Validator Split
          </button>
        </div>
      )}

      {partial && (
        <p className={styles.allocationFundNote}>
          Partial list: not every option of this stream could be read from the chain.
        </p>
      )}

      {activeTab === "Actual" && (
        <div className={styles.allocationFundChartBox}>
          <div className={styles.allocationFundCanvasContainer}>
            {dataActual.length ? (
              <PieChart width={350} height={350}>
                <Pie
                  data={dataActual}
                  cx="50%"
                  cy="50%"
                  outerRadius={120}
                  fill="#8884d8"
                  paddingAngle={0}
                  cornerRadius={2}
                  startAngle={90}
                  endAngle={450}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {dataActual.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Legend
                  content={(props) => renderCustomLegend(props, dataActual)}
                  layout="horizontal"
                  align="center"
                  verticalAlign="bottom"
                />
              </PieChart>
            ) : (
              <p className={styles.allocationFundEmpty}>
                {options === null ? "Could not load this stream." : "No weight is allocated yet."}
              </p>
            )}
          </div>
        </div>
      )}

      {activeTab === "Split" && editable && (
        <div className={styles.allocationFundChartBox}>
          <p className={styles.allocationFundNote}>
            Only transparent bonded stake counts here, which on this chain is a validator&apos;s own
            self-bond while that validator is in the active set. Your weight: {formatMacro(voterWeight, UERTH)} ERTH.
            Private stakers direct Groundworks with positions in the mobile app.
          </p>
          {validatorStatus === "" && (
            <p className={styles.allocationFundNote} role="status">
              This account runs no validator, so it has no Groundworks weight here.
            </p>
          )}
          {validatorStatus && validatorStatus !== "BOND_STATUS_BONDED" && (
            <p className={styles.allocationFundNote} role="status">
              Your validator isn&apos;t in the active set (it is jailed, unbonding or unbonded), so it
              has no Groundworks weight and its split cannot be set. Its self-bond counts again once
              it is back in the active set.
            </p>
          )}
          <p className={styles.allocationFundNote}>
            A split counts for {leaseText(leaseSeconds)} from when it is cast or renewed. Casting it
            again renews it; nothing renews it automatically.
          </p>
          {lease && lease.lapsed && (
            <p className={styles.allocationFundNote} role="status">
              Lapsed: your split stopped counting on {dateText(lease.expiresAt)}. Re-cast it (prefilled
              below) to count for another {leaseText(leaseSeconds)}.
            </p>
          )}
          {lease && !lease.lapsed && (() => {
            const left = lease.expiresAt - Date.now() / 1000;
            return (
              <p className={styles.allocationFundNote} role="status">
                {left <= allocation.RENEW_WARNING_SECONDS && <strong>Renew soon. </strong>}
                Your split counts until {dateText(lease.expiresAt)} ({Math.max(0, Math.ceil(left / DAY))} days
                left). Renewing it now makes it count for {leaseText(leaseSeconds)} from today.
              </p>
            );
          })()}
          {staleSplit && (
            <p className={styles.allocationFundNote} role="status">
              Stale split: this was set in epoch {staleSplit.epoch}, and the stream is now in epoch{" "}
              {streamEpoch}. It no longer counts until you set it again.
            </p>
          )}
          <div className={styles.allocationFundCanvasContainer}>
            <div style={{ position: "relative", width: 350, height: 350 }}>
              <PieChart width={350} height={350}>
                <Pie
                  data={getChartDataWithUnallocated(selectedAllocations)}
                  cx="50%"
                  cy="50%"
                  innerRadius={70}
                  outerRadius={120}
                  fill="#8884d8"
                  paddingAngle={0}
                  cornerRadius={2}
                  startAngle={90}
                  endAngle={450}
                  dataKey="value"
                  isAnimationActive={false}
                >
                  {getChartDataWithUnallocated(selectedAllocations).map((entry, index) =>
                    entry.name === "Unallocated" ? (
                      <Cell key={`cell-${index}`} fill={UNALLOCATED_COLOR} />
                    ) : (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ),
                  )}
                </Pie>
              </PieChart>
              <div
                style={{
                  position: "absolute",
                  top: "50%",
                  left: "50%",
                  transform: "translate(-50%, -50%)",
                  fontSize: 24,
                  color: totalPercentage === 100 ? "green" : "red",
                }}
              >
                {`${totalPercentage}%`}
              </div>
            </div>
          </div>

          <div className={styles.allocationFundInputContainer}>
            {selectedAllocations.map((alloc) => (
              <div key={alloc.id} className={styles.allocationFundInputGroup}>
                <span>{alloc.name}</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={alloc.value}
                  onChange={(e) => handlePercentageChange(alloc.id, e.target.value)}
                  placeholder="%"
                />
                <button className={styles.allocationFundCircleButton} onClick={() => removeAllocation(alloc.id)}>
                  -
                </button>
              </div>
            ))}
          </div>

          <div className={styles.allocationFundDropdownContainer}>
            <button className={styles.allocationFundCircleButton} onClick={() => setShowDropdown(!showDropdown)}>
              +
            </button>
            {showDropdown && (
              <select
                onChange={(e) => {
                  const selectedOption = allocationOptions.find(
                    (option) => String(option.id) === String(e.target.value),
                  );
                  if (selectedOption) addAllocation(selectedOption);
                }}
              >
                <option value="">Select an option</option>
                {allocationOptions
                  .filter((option) => !selectedAllocations.some((alloc) => String(alloc.id) === String(option.id)))
                  .map((option) => (
                    <option key={option.id} value={option.id}>
                      {option.name}
                    </option>
                  ))}
              </select>
            )}
          </div>

          {selectedAllocations.length > 0 && splitProblem && (
            <p className={styles.allocationFundNote} role="status">
              {splitProblem}
            </p>
          )}
          {selectedAllocations.length > 0 && (
            <button
              onClick={handleSetAllocation}
              className={styles.allocationFundClaimButton}
              disabled={isSubmitting || Boolean(splitProblem) || toBigInt(voterWeight) <= 0n}
            >
              {isSubmitting
                ? "Submitting..."
                : lease?.lapsed
                  ? "Re-cast Split"
                  : lease && sameSplit(splitWeights, lease.current)
                    ? "Renew Split"
                    : "Set Allocation"}
            </button>
          )}
        </div>
      )}

      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} txHash={txHash} />
    </div>
  );
};

export default AllocationFund;
