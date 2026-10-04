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
 * `options` comes from the page so the pie and the page's table agree.
 */
const AllocationFund = ({ title, stream, options, streamEpoch = 0, onChanged, totalWeight, partial = false }) => {
  const { address, isConnected } = useWallet();
  const { isModalOpen, animationState, error: txError, txHash, execute, closeModal } = useTransaction();

  const editable = stream === allocation.STREAM_GROUNDWORKS && isConnected;

  const [activeTab, setActiveTab] = useState("Actual");
  const [selectedAllocations, setSelectedAllocations] = useState([]);
  const [voterWeight, setVoterWeight] = useState("0");
  // { epoch } of a split filed before the stream's current epoch: shown, but
  // it no longer counts until set again.
  const [staleSplit, setStaleSplit] = useState(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const labelFor = (option) => `#${option.id} ${option.description || "Unknown"}`;
  const live = (options ?? []).filter((o) => !o.removed);
  const allocationOptions = live.map((o) => ({ id: o.id, name: labelFor(o) }));
  // The pie takes floats: each option's share of the total in percent, worked
  // out exactly from the integer weights first (they pass 2^53). The total is
  // the chain's stream total, so a partial option list (audit 6 L-6) leaves
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
  // Each share an integer 1..100, distinct, summing to 100 (audit 6 L-7):
  // the chain's ValidateSplit, checked before a fee is spent on it.
  const splitWeights = selectedAllocations.map((alloc) => ({ optionId: alloc.id, percent: alloc.value }));
  const splitProblem = allocation.splitProblem(splitWeights);

  useEffect(() => {
    if (!editable) setActiveTab("Actual");
  }, [editable]);

  useEffect(() => {
    if (activeTab !== "Split" || !editable || !address) return;
    let cancelled = false;
    allocation
      .groundworksVoter(address, { streamEpoch })
      .then(({ splits, weight, stale, epoch }) => {
        if (cancelled) return;
        setVoterWeight(weight);
        setStaleSplit(stale ? { epoch } : null);
        setSelectedAllocations(
          splits.map((w) => {
            const o = live.find((item) => item.id === w.optionId);
            return { id: w.optionId, name: o ? labelFor(o) : `#${w.optionId}`, value: w.percent };
          }),
        );
      })
      .catch((err) => console.error(`Error fetching split for ${title}:`, err));
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
            self-bond. Your weight: {formatMacro(voterWeight, UERTH)} ERTH.
            Private stakers direct Groundworks with positions in the mobile app.
          </p>
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
              disabled={isSubmitting || Boolean(splitProblem) || voterWeight === "0"}
            >
              {isSubmitting ? "Submitting..." : "Set Allocation"}
            </button>
          )}
        </div>
      )}

      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} txHash={txHash} />
    </div>
  );
};

export default AllocationFund;
