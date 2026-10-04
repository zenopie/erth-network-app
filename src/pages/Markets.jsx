import React, { useState, useEffect, useMemo, useCallback } from "react";
import styles from "./Markets.module.css";
import * as dex from "../chain/dex";
import * as allocation from "../chain/allocation";
import { balances, supplyOrNull } from "../chain/bank";
import { broadcast } from "../chain/tx";
import { UANML, UERTH } from "../chain/config";
import { amountOk, formatUnits, isKnownDenom, logoOf, ratio, sumBig, symbolOf, toMacro, toMicro, typedFloat } from "../chain/tokens";
import StatusModal from "../components/StatusModal";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import { formatUSD } from "../utils/apiUtils";
import useErthPrice from "../hooks/useErthPrice";
import { formatPrice, formatApr, formatDuration } from "../utils/formatUtils";
import Amount from "../components/Amount";
import MobileCta from "../components/MobileCta";
import ShieldedAddressInput from "../components/ShieldedAddressInput";
import { decodeShieldedAddress } from "../chain/shieldedAddress";
import { aprFor } from "../chain/apr";
import { useDisplayCurrency } from "../contexts/DisplayCurrencyContext";
import AmountNote from "../components/AmountNote";

// Slippage tolerance for a liquidity deposit, in percent.
//
// Matches the swap page's default. Not a control here: a deposit is entered as
// two amounts in the pool's own ratio, so the only thing that moves between
// signing and execution is a trade landing in between, and 1% is wide enough to
// absorb ordinary block-to-block drift while still refusing a sandwich. If a
// deposit starts failing with "would mint ... want >=", the pool moved further
// than that and the amounts want re-entering rather than the floor loosening.
const LP_SLIPPAGE_PERCENT = 1;

// The deflation stream emits a flat 1 ERTH/sec, split across allocation options
// by staker vote. Whatever share lands on the LP-rewards option is what funds
// LP yield, distributed across pools by their share of trading volume.

const Markets = () => {
  const { address, isConnected } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, error: txError, txHash, execute, closeModal } = useTransaction();

  const [pools, setPools] = useState([]);
  const [lpSupplies, setLpSupplies] = useState({}); // lpDenom -> total shares, null if unread
  const [walletBalances, setWalletBalances] = useState({});
  const [lpRewardShare, setLpRewardShare] = useState(0); // 0..1 of the Groundworks stream
  const [swapFee, setSwapFee] = useState(0); // percent, e.g. 0.3
  const [unbondSeconds, setUnbondSeconds] = useState(0);
  const [unbondings, setUnbondings] = useState([]); // this wallet's pending withdrawals
  const [burns, setBurns] = useState([]); // live protocol-owned-liquidity schedules
  const [refreshKey, setRefreshKey] = useState(0);
  const erthPrice = useErthPrice();

  // LP management state
  const [expandedPool, setExpandedPool] = useState(null);
  const [lpTab, setLpTab] = useState("Add");
  const [erthAmount, setErthAmount] = useState("");
  const [tokenBAmount, setTokenBAmount] = useState("");
  const [removeAmount, setRemoveAmount] = useState("");
  // ANML pool: the shielded address its ANML leg is paid to.
  const [anmlRecipient, setAnmlRecipient] = useState("");
  const { currency } = useDisplayCurrency();
  // In ERTH mode every value is already ERTH-denominated, so the rate is 1 and
  // nothing depends on the price feed. USD mode multiplies by the fetched price
  // — and is disabled precisely because that feed has nothing to report.
  const rate = currency === "USD" ? erthPrice : 1;

  const [sortBy, setSortBy] = useState("liquidityUsd");
  const [sortOrder, setSortOrder] = useState("desc");

  const refreshParent = () => setRefreshKey((p) => p + 1);

  // Pools, LP supplies and the LP-rewards share are all public chain reads.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      showLoading();
      try {
        const [ps, stream, fee, escrowSeconds, polSchedules] = await Promise.all([
          dex.pools(),
          allocation.streamView(allocation.STREAM_GROUNDWORKS),
          dex.swapFeePercent(),
          dex.lpUnbondingSeconds(),
          dex.polBurns(),
        ]);
        if (cancelled) return;
        setPools(ps);
        setSwapFee(fee);
        setUnbondSeconds(escrowSeconds);
        setBurns(polSchedules);

        // Integer weights past 2^53: the ratio is taken exactly, then made a
        // float. The share is of the chain's stream total, not of the options
        // loaded (a partial list would overstate it).
        const options = stream?.options ?? [];
        const totalWeight = stream && BigInt(stream.totalWeight) > 0n ? stream.totalWeight : sumBig(options.map((o) => o.amountAllocated));
        const lpOption = options.find((o) => o.kind === "ALLOCATION_KIND_INTEGRATED" && !o.removed);
        setLpRewardShare(lpOption ? ratio(lpOption.amountAllocated, totalWeight) : 0);

        const supplies = await Promise.all(ps.map((p) => supplyOrNull(p.lpDenom)));
        if (cancelled) return;
        setLpSupplies(Object.fromEntries(ps.map((p, i) => [p.lpDenom, supplies[i]])));
      } catch (err) {
        console.error("Error loading markets:", err);
      } finally {
        if (!cancelled) hideLoading();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [refreshKey]);

  const fetchBalances = useCallback(async () => {
    setWalletBalances(address ? await balances(address) : {});
  }, [address]);

  useEffect(() => {
    fetchBalances();
  }, [fetchBalances, refreshKey]);

  // Pending withdrawals are per wallet, and they mature on their own — nothing
  // is signed to collect them, so this is the only place they are visible at all.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = address ? await dex.lpUnbondings(address) : [];
      if (!cancelled) setUnbondings(list);
    })();
    return () => {
      cancelled = true;
    };
  }, [address, refreshKey]);

  const marketRows = useMemo(
    () =>
      pools.map((p) => {
        const erthReserve = toMacro(p.erthReserve, UERTH);
        const tokenReserve = toMacro(p.tokenReserve, p.tokenDenom);
        // A pool is half ERTH by construction, so TVL is twice the ERTH side.
        const tvlErth = erthReserve * 2;
        const liquidityUsd = tvlErth * (rate ?? 0);
        const volumeErth = toMacro(p.volumeErth, UERTH);

        // Fees plus emissions, the same arithmetic the mobile app runs — see
        // chain/apr.js. Fees are live from the first trade; emissions are zero
        // until voters allocate weight to the LP-rewards option.
        const rates = aprFor(p, pools, lpRewardShare, swapFee);
        const apr = (rates?.total ?? 0) * 100;
        const aprFee = (rates?.fee ?? 0) * 100;
        const aprEmission = (rates?.emission ?? 0) * 100;

        const price = tokenReserve > 0 ? (erthReserve / tokenReserve) * (rate ?? 0) : 0;

        const userShares = toMacro(walletBalances[p.lpDenom] ?? 0, p.lpDenom);
        // Null when the supply read failed. Kept apart from the macro figure,
        // which reads a failure as zero — fine for display, not for a floor.
        const totalSharesBase = lpSupplies[p.lpDenom] ?? null;
        const totalShares = toMacro(totalSharesBase ?? 0, p.lpDenom);
        const ownership = totalShares > 0 ? (userShares / totalShares) * 100 : 0;

        // Shares of this pool the wallet has withdrawn and is waiting out. They
        // are off the balance but still working for the pool, so they still
        // count as a position — the row shows them beside the live shares
        // rather than folding them in, since they cannot be withdrawn twice.
        const pending = unbondings.filter((u) => u.poolId === p.id);
        const pendingShares = pending.reduce((s, u) => s + toMacro(u.shares, p.lpDenom), 0);

        // Protocol-owned liquidity, if this pool still has a live retirement
        // schedule. `remaining` is what the module account still holds; the
        // straight line is what it is being retired on.
        const burn = burns.find((b) => b.poolId === p.id) ?? null;
        const polRemaining = burn ? toMacro(burn.sharesRemaining, p.lpDenom) : 0;
        const polShare = burn && totalShares > 0 ? (polRemaining / totalShares) * 100 : 0;
        const polRetiredPct = burn
          ? 100 * (1 - polRemaining / Math.max(toMacro(burn.totalShares, p.lpDenom), 1e-9))
          : 0;
        // start_time is zero on the genesis schedule — the genesis file cannot
        // know the chain's first block time — so there is no end date to show
        // for it, only a duration.
        const polEnds =
          burn && burn.startTime > 0 ? (burn.startTime + burn.durationSeconds) * 1000 : null;

        return {
          pool: p,
          key: p.tokenDenom,
          symbol: symbolOf(p.tokenDenom),
          price,
          volumeErth,
          liquidityUsd,
          tvlErth,
          apr,
          aprFee,
          aprEmission,
          erthReserve,
          tokenReserve,
          userShares,
          userSharesBase: String(walletBalances[p.lpDenom] ?? "0"),
          totalShares,
          totalSharesBase,
          ownership,
          userErth: (erthReserve * ownership) / 100,
          userTokenB: (tokenReserve * ownership) / 100,
          pending,
          pendingShares,
          burn,
          polShare,
          polRetiredPct,
          polEnds,
        };
      }),
    [pools, rate, lpRewardShare, swapFee, walletBalances, lpSupplies, unbondings, burns],
  );

  const handleSort = (field) => {
    if (sortBy === field) setSortOrder((o) => (o === "desc" ? "asc" : "desc"));
    else {
      setSortBy(field);
      setSortOrder("desc");
    }
  };

  const sortedRows = useMemo(
    () =>
      [...marketRows].sort((a, b) => {
        const av = a[sortBy] || 0;
        const bv = b[sortBy] || 0;
        return sortOrder === "desc" ? bv - av : av - bv;
      }),
    [marketRows, sortBy, sortOrder],
  );

  const totalTvlUsd = marketRows.reduce((s, r) => s + r.liquidityUsd, 0);
  const totalVolumeErth = marketRows.reduce((s, r) => s + r.volumeErth, 0);

  // ---- LP management ----

  const togglePool = (key) => {
    if (expandedPool === key) {
      setExpandedPool(null);
      return;
    }
    setExpandedPool(key);
    setLpTab("Add");
    setErthAmount("");
    setTokenBAmount("");
    setRemoveAmount("");
  };

  // Deposits must match the current pool ratio, so editing one side sets the
  // other: in base units, rounded UP as x/dex pulls each leg (dex.depositLeg),
  // so the typed side buys every share it can and at most a unit comes back.
  const derivedLeg = (val, typedDenom, from, to, otherDenom) => {
    const micro = toMicro(val, typedDenom);
    const leg = dex.depositLeg(micro, from, to);
    return leg === "0" ? "" : formatUnits(leg, otherDenom);
  };

  const handleErthChange = (val, row) => {
    setErthAmount(val);
    setTokenBAmount(derivedLeg(val, UERTH, row.pool.erthReserve, row.pool.tokenReserve, row.pool.tokenDenom));
  };

  const handleTokenBChange = (val, row) => {
    setTokenBAmount(val);
    setErthAmount(derivedLeg(val, row.pool.tokenDenom, row.pool.tokenReserve, row.pool.erthReserve, UERTH));
  };

  const handleAddLiquidity = (row) => {
    if (!isConnected) return;
    execute(async () => {
      // Price the deposit against the pool's reserves and share supply read
      // NOW, then accept anything within LP_SLIPPAGE_PERCENT of it. The rows
      // on the page may be minutes old; a floor priced on them is a floor on
      // a ratio that no longer exists. Without a floor the deposit mints
      // whatever ratio it lands on, and moving the ratio either side of it is
      // the standard sandwich.
      //
      // All of it in base units on integers. A floor of zero means there was
      // nothing to price against (a read failed): refuse rather than send the
      // unprotected deposit the floor exists to prevent.
      const erthMicro = toMicro(erthAmount, UERTH);
      const tokenMicro = toMicro(tokenBAmount, row.pool.tokenDenom);
      const minShares = BigInt(
        await dex.addLiquidityFloor(row.pool.id, erthMicro, tokenMicro, LP_SLIPPAGE_PERCENT),
      );
      if (minShares <= 0n) {
        throw new Error(
          "Couldn't read this pool's reserves and share supply, so the deposit can't be protected " +
            "against price movement. Refresh and try again.",
        );
      }
      await broadcast([
        dex.msgAddLiquidity(
          address,
          row.pool.id,
          UERTH,
          erthMicro,
          row.pool.tokenDenom,
          tokenMicro,
          minShares.toString(),
        ),
      ]);
      setErthAmount("");
      setTokenBAmount("");
      refreshParent();
    });
  };

  const handleRemoveLiquidity = (row) => {
    if (!isConnected) return;
    execute(async () => {
      await broadcast([
        dex.msgRemoveLiquidity(address, row.pool.id, toMicro(removeAmount, row.pool.lpDenom)),
      ]);
      setRemoveAmount("");
      refreshParent();
    });
  };

  // The ANML pool pays its ANML leg as a note to a shielded address, priced
  // when the escrow matures (value-blind ciphertext), and the ERTH leg to
  // this account.
  const handleRemoveAnmlLiquidity = (row) => {
    if (!isConnected) return;
    execute(async () => {
      const shares = toMicro(removeAmount, row.pool.lpDenom);
      // Reserve and supply read together now; a failed read refuses.
      const problem = await dex.withdrawalNoteLegProblemNow(row.pool.id, shares);
      if (problem) throw new Error(problem);
      await broadcast([
        dex.removeLiquidityToShielded(
          address,
          row.pool.id,
          shares,
          anmlRecipient,
        ),
      ]);
      setRemoveAmount("");
      refreshParent();
    });
  };

  let anmlRecipientOk = false;
  try {
    decodeShieldedAddress(anmlRecipient);
    anmlRecipientOk = true;
  } catch {
    /* shown by the input */
  }

  const erthBalance = toMacro(walletBalances[UERTH] ?? 0, UERTH);

  return (
    <div className={styles.marketsPage}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} error={txError} txHash={txHash} />

      {/* Header */}
      <div className={styles.marketsHeader}>
        <div className={styles.marketsHeaderLeft}>
          <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.marketsErthLogo} />
          {currency === "USD" && (
            <div>
              <span className={styles.marketsErthLabel}>ERTH Price</span>
              <span className={styles.marketsErthPrice}>{formatPrice(erthPrice)}</span>
            </div>
          )}
          <div className={styles.marketsHeaderStat}>
            <span className={styles.marketsErthLabel}>Total TVL</span>
            <span className={styles.marketsHeaderVal}><Amount value={totalTvlUsd} /></span>
          </div>
          <div className={styles.marketsHeaderStat}>
            <span className={styles.marketsErthLabel}>Volume</span>
            <span className={styles.marketsHeaderVal}>
              {rate ? <Amount value={totalVolumeErth * rate} /> : "--"}
            </span>
          </div>
        </div>
        <div className={styles.marketsHeaderRight}>
          {/* LP rewards auto-compound into each pool's reserves, so there is
              nothing to claim — your share simply grows in redemption value. */}
          <span className={styles.marketsCountdown}>LP rewards auto-compound</span>
        </div>
      </div>

      {/* Column headers */}
      <div className={styles.poolRowHeader}>
        <div className={styles.poolHeaderPair}>Pair</div>
        <div className={styles.poolRowStats}>
          <div className={styles.poolRowStat}>
            <button
              className={`${styles.poolHeaderLabel} ${sortBy === "liquidityUsd" ? styles.active : ""}`}
              onClick={() => handleSort("liquidityUsd")}
            >
              Liquidity {sortBy === "liquidityUsd" && (sortOrder === "desc" ? "↓" : "↑")}
            </button>
          </div>
          <div className={styles.poolRowStat}>
            <button
              className={`${styles.poolHeaderLabel} ${sortBy === "volumeErth" ? styles.active : ""}`}
              onClick={() => handleSort("volumeErth")}
            >
              Volume {sortBy === "volumeErth" && (sortOrder === "desc" ? "↓" : "↑")}
            </button>
          </div>
          <div className={styles.poolRowStat}>
            <button
              className={`${styles.poolHeaderLabel} ${sortBy === "apr" ? styles.active : ""}`}
              onClick={() => handleSort("apr")}
            >
              APR {sortBy === "apr" && (sortOrder === "desc" ? "↓" : "↑")}
            </button>
          </div>
        </div>
        <div className={styles.poolRowActionsPlaceholder}></div>
      </div>

      {/* Pool cards */}
      {sortedRows.map((row) => {
        const isExpanded = expandedPool === row.key;
        const tokenBalance = toMacro(walletBalances[row.pool.tokenDenom] ?? 0, row.pool.tokenDenom);

        return (
          <div className={styles.poolCard} key={row.key}>
            <div className={styles.poolRowTop}>
              <div className={styles.poolRowPair}>
                <img
                  src={logoOf(row.pool.tokenDenom)}
                  alt={row.symbol}
                  className={styles.poolRowLogo}
                />
                <div>
                  <div className={styles.poolRowName}>
                    <span className={styles.poolRowToken}>{row.symbol}</span>
                    <span className={styles.poolRowSlash}>/ ERTH</span>
                  </div>
                  <span className={styles.poolRowPrice}><Amount value={row.price} mode="price" /></span>
                </div>
              </div>
              <div className={styles.poolRowStats}>
                <div className={styles.poolRowStat}>
                  <span className={styles.poolRowStatVal}><Amount value={row.liquidityUsd} /></span>
                  <span className={styles.poolRowStatLabel}>Liquidity</span>
                </div>
                <div className={styles.poolRowStat}>
                  <span className={styles.poolRowStatVal}>
                    {row.volumeErth > 0 && rate ? <Amount value={row.volumeErth * rate} /> : "--"}
                  </span>
                  <span className={styles.poolRowStatLabel}>Volume</span>
                </div>
                <div className={styles.poolRowStat}>
                  <span className={`${styles.poolRowStatVal} ${row.apr > 0 ? styles.green : ""}`}>
                    {formatApr(row.apr)}
                  </span>
                  <span className={styles.poolRowStatLabel}>APR</span>
                </div>
              </div>
              <div className={styles.poolRowActions}>
                <a href="/swap-tokens" className={`${styles.poolRowBtn} ${styles.primary}`}>
                  Trade
                </a>
                <button
                  className={`${styles.poolRowBtn} ${styles.secondary}`}
                  onClick={() => togglePool(row.key)}
                >
                  {isExpanded ? "Close" : "+ LP"}
                </button>
              </div>
            </div>

            {/* Expanded LP section */}
            {isExpanded && (
              <div className={styles.poolExpand}>
                <div className={styles.poolExpandCols}>
                  <div className={styles.poolExpandInfo}>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>ERTH Reserve</span>
                      <span className={styles.lpInfoVal}>
                        {row.erthReserve.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>{row.symbol} Reserve</span>
                      <span className={styles.lpInfoVal}>
                        {row.tokenReserve.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                      </span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>Total Shares</span>
                      <span className={styles.lpInfoVal}>{row.totalShares.toLocaleString()}</span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>Your Shares</span>
                      <span className={styles.lpInfoVal}>{row.userShares.toLocaleString()}</span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>Ownership</span>
                      <span className={styles.lpInfoVal}>{row.ownership.toFixed(4)}%</span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>APR</span>
                      <span className={`${styles.lpInfoVal} ${styles.green}`}>
                        {formatApr(row.apr)}
                      </span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>Your ERTH Value</span>
                      <span className={styles.lpInfoVal}>{row.userErth.toFixed(4)}</span>
                    </div>
                    <div className={styles.lpInfoItem}>
                      <span className={styles.lpInfoLabel}>Your {row.symbol} Value</span>
                      <span className={styles.lpInfoVal}>{row.userTokenB.toFixed(4)}</span>
                    </div>
                    {row.burn && (
                      <div className={`${styles.lpInfoItem} ${styles.wide}`}>
                        <span className={styles.lpInfoLabel}>
                          Protocol-Owned{" "}
                          {row.polEnds
                            ? `(retiring by ${new Date(row.polEnds).toLocaleDateString()})`
                            : `(retiring over ${Math.round(
                                row.burn.durationSeconds / (365 * 24 * 60 * 60),
                              )}y)`}
                        </span>
                        <span className={styles.lpInfoVal}>
                          {row.polShare.toFixed(2)}% of pool · {row.polRetiredPct.toFixed(1)}%
                          retired
                        </span>
                      </div>
                    )}
                  </div>

                  {row.pool.tokenDenom === UANML ? (
                    /* ANML exists only as notes. Adding is
                       MsgAddLiquidityShielded (one bundle, both legs from
                       notes, proven on the phone), which mints the shares as
                       a private note: they never show here and are withdrawn
                       in the app (MsgRemoveLiquidityShielded). Withdrawing
                       transparent shares (e.g. auction-era) is a signed
                       MsgRemoveLiquidity whose ANML leg is minted as a note
                       to a shielded address (pc + value-blind ciphertext),
                       so a Keplr account holding these LP shares can leave
                       here. */
                    <div className={styles.poolExpandActions}>
                      <MobileCta title="Provide ANML liquidity in the Earth Wallet app">
                        ANML is always private, so adding to this pool is done from your
                        shielded balance on your phone. Those LP shares are private notes too: they are
                        shown and withdrawn only in the app.
                      </MobileCta>
                      {row.userShares > 0 && (
                        <div className={styles.lpContent}>
                          <p className={styles.lpNote}>
                            Withdraw: the ERTH comes back to this account; the ANML is paid as a
                            private note to a shielded address from the Earth Wallet app
                            (Receive → <code>erthz1…</code>). ANML cannot be held in Keplr.
                          </p>
                          <ShieldedAddressInput value={anmlRecipient} onChange={setAnmlRecipient} />
                          <div className={styles.lpInputGroup}>
                            <div className={styles.lpInputHeader}>
                              <label>Shares</label>
                              <span className={styles.lpBalance}>
                                Bal: {row.userShares.toLocaleString()}{" "}
                                <button
                                  className={styles.lpMaxBtn}
                                  onClick={() => setRemoveAmount(formatUnits(row.userSharesBase, row.pool.lpDenom))}
                                >
                                  Max
                                </button>
                              </span>
                            </div>
                            <div className={styles.lpInputWrapper}>
                              <div className={styles.lpInputInner} style={{ paddingLeft: 16 }}>
                                <input
                                  inputMode="decimal"
                                  placeholder="0.0"
                                  value={removeAmount}
                                  onChange={(e) => setRemoveAmount(e.target.value)}
                                  className={styles.lpInput}
                                />
                              </div>
                              <AmountNote value={removeAmount} denom={row.pool.lpDenom} />
                            </div>
                          </div>
                          <button
                            className={styles.lpActionBtn}
                            onClick={() => handleRemoveAnmlLiquidity(row)}
                            disabled={
                              !isConnected ||
                              !anmlRecipientOk ||
                              !amountOk(removeAmount, row.pool.lpDenom, row.userSharesBase)
                            }
                          >
                            Remove Liquidity
                          </button>
                          <p className={styles.lpNote}>
                            {unbondSeconds > 0
                              ? `Escrowed for ${formatDuration(unbondSeconds)} — the position keeps earning until it matures, then pays out on its own: ERTH here, ANML to the note.`
                              : "Paid out immediately: ERTH here, ANML to the note."}{" "}
                            One ANML-pool withdrawal per block.
                          </p>
                          {row.pending.length > 0 && (
                            <div className={styles.lpUnbondList}>
                              <span className={styles.lpUnbondLabel}>
                                Pending withdrawals ({row.pendingShares.toLocaleString()} shares)
                              </span>
                              {row.pending.map((u, i) => (
                                <div key={i} className={styles.lpUnbondItem}>
                                  <span>{toMacro(u.shares, row.pool.lpDenom).toLocaleString()} shares</span>
                                  <span className={styles.lpUnbondLabel}>
                                    {u.completionTime * 1000 <= Date.now()
                                      ? "Maturing now"
                                      : new Date(u.completionTime * 1000).toLocaleString()}
                                  </span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                  <div className={styles.poolExpandActions}>
                    <div className={styles.lpTabs}>
                      {["Add", "Remove"].map((t) => (
                        <button
                          key={t}
                          className={`${styles.lpTab} ${lpTab === t ? styles.active : ""}`}
                          onClick={() => setLpTab(t)}
                        >
                          {t}
                        </button>
                      ))}
                    </div>

                    {lpTab === "Add" && (
                      <div className={styles.lpContent}>
                        {!isKnownDenom(row.pool.tokenDenom) && (
                          <p className={styles.lpNote}>
                            This app does not know how many decimals {row.symbol} has, so it cannot
                            enter a deposit of it. Its amounts are shown in base units.
                          </p>
                        )}
                        <div className={styles.lpInputGroup}>
                          <div className={styles.lpInputHeader}>
                            <label>{row.symbol}</label>
                            <span className={styles.lpBalance}>
                              Bal: {tokenBalance.toLocaleString()}{" "}
                              <button
                                className={styles.lpMaxBtn}
                                onClick={() => handleTokenBChange(formatUnits(walletBalances[row.pool.tokenDenom] ?? "0", row.pool.tokenDenom), row)}
                              >
                                Max
                              </button>
                            </span>
                          </div>
                          <div className={styles.lpInputWrapper}>
                            <img
                              src={logoOf(row.pool.tokenDenom)}
                              alt={row.symbol}
                              className={styles.lpInputLogo}
                            />
                            <div className={styles.lpInputInner}>
                              <input
                                inputMode="decimal"
                                placeholder="0.0"
                                value={tokenBAmount}
                                onChange={(e) => handleTokenBChange(e.target.value, row)}
                                className={styles.lpInput}
                              />
                              <AmountNote value={tokenBAmount} denom={row.pool.tokenDenom} />
                              <span className={styles.lpInputUsd}>
                                {tokenBAmount && row.price ? (
                                  <Amount value={typedFloat(tokenBAmount, row.pool.tokenDenom) * row.price} mode="price" />
                                ) : (
                                  ""
                                )}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className={styles.lpInputGroup}>
                          <div className={styles.lpInputHeader}>
                            <label>ERTH</label>
                            <span className={styles.lpBalance}>
                              Bal: {erthBalance.toLocaleString()}{" "}
                              <button
                                className={styles.lpMaxBtn}
                                onClick={() => handleErthChange(formatUnits(walletBalances[UERTH] ?? "0", UERTH), row)}
                              >
                                Max
                              </button>
                            </span>
                          </div>
                          <div className={styles.lpInputWrapper}>
                            <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.lpInputLogo} />
                            <div className={styles.lpInputInner}>
                              <input
                                inputMode="decimal"
                                placeholder="0.0"
                                value={erthAmount}
                                onChange={(e) => handleErthChange(e.target.value, row)}
                                className={styles.lpInput}
                              />
                              <AmountNote value={erthAmount} denom={UERTH} />
                              <span className={styles.lpInputUsd}>
                                {currency === "USD" && erthAmount && erthPrice
                                  ? formatUSD(typedFloat(erthAmount, UERTH) * erthPrice)
                                  : ""}
                              </span>
                            </div>
                          </div>
                        </div>
                        <button
                          className={styles.lpActionBtn}
                          onClick={() => handleAddLiquidity(row)}
                          disabled={
                            !isConnected ||
                            row.totalSharesBase === null ||
                            !amountOk(erthAmount, UERTH, walletBalances[UERTH] ?? "0") ||
                            !amountOk(tokenBAmount, row.pool.tokenDenom, walletBalances[row.pool.tokenDenom] ?? "0")
                          }
                        >
                          Add Liquidity
                        </button>
                      </div>
                    )}

                    {lpTab === "Remove" && (
                      <div className={styles.lpContent}>
                        <div className={styles.lpInputGroup}>
                          <div className={styles.lpInputHeader}>
                            <label>Shares</label>
                            <span className={styles.lpBalance}>
                              Bal: {row.userShares.toLocaleString()}{" "}
                              <button
                                className={styles.lpMaxBtn}
                                onClick={() => setRemoveAmount(formatUnits(row.userSharesBase, row.pool.lpDenom))}
                              >
                                Max
                              </button>
                            </span>
                          </div>
                          <div className={styles.lpInputWrapper}>
                            <div className={styles.lpInputInner} style={{ paddingLeft: 16 }}>
                              <input
                                inputMode="decimal"
                                placeholder="0.0"
                                value={removeAmount}
                                onChange={(e) => setRemoveAmount(e.target.value)}
                                className={styles.lpInput}
                              />
                            </div>
                            <AmountNote value={removeAmount} denom={row.pool.lpDenom} />
                          </div>
                        </div>
                        <button
                          className={styles.lpActionBtn}
                          onClick={() => handleRemoveLiquidity(row)}
                          disabled={
                            !isConnected ||
                            !amountOk(removeAmount, row.pool.lpDenom, row.userSharesBase)
                          }
                        >
                          Remove Liquidity
                        </button>
                        {/* Withdrawn shares are escrowed, not burned: the pool
                            keeps trading on the liquidity behind them, so the
                            position keeps earning fees and LP rewards for the
                            whole wait and is priced at maturity. The cost of
                            leaving is time, not yield. */}
                        <p className={styles.lpNote}>
                          {unbondSeconds > 0
                            ? `Escrowed for ${formatDuration(unbondSeconds)} — the position keeps earning until it matures, then pays out on its own.`
                            : "Tokens are returned immediately"}
                        </p>

                        {row.pending.length > 0 && (
                          <div className={styles.lpUnbondList}>
                            <span className={styles.lpUnbondLabel}>
                              Pending withdrawals ({row.pendingShares.toLocaleString()} shares)
                            </span>
                            {row.pending.map((u, i) => (
                              <div key={i} className={styles.lpUnbondItem}>
                                <span>
                                  {toMacro(u.shares, row.pool.lpDenom).toLocaleString()} shares
                                </span>
                                <span className={styles.lpUnbondLabel}>
                                  {u.completionTime * 1000 <= Date.now()
                                    ? "Maturing now"
                                    : new Date(u.completionTime * 1000).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
};

export default Markets;
