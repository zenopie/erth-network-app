import React, { useState, useEffect, useCallback } from "react";
import * as dex from "../chain/dex";
import { balance } from "../chain/bank";
import { broadcast } from "../chain/tx";
import { UERTH } from "../chain/config";
import { symbolOf, toMacro, toMicro } from "../chain/tokens";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import useTransaction from "../hooks/useTransaction";
import StatusModal from "../components/StatusModal";
import styles from "./LiquidityAuction.module.css";

/**
 * The genesis liquidity auction.
 *
 * Two thirds of the pre-mine is split in half: one half is paid out to bidders
 * pro rata to what they bid, the other half is paired with everything raised to
 * open the pool. Because the halves are equal, the pool opens at exactly the
 * price the auction cleared at — there is no separate price to set and no gap to
 * arbitrage on the first block.
 *
 * The LP shares from that pool are minted to the module account, which cannot
 * sign a transaction, so nobody owns that liquidity — governance included. It is
 * retired on a schedule instead (see the Markets page).
 *
 * Three things a bidder has to be able to see and cannot work out for
 * themselves: whether the window is open, what the auction is clearing at right
 * now, and that a bid is final. All three are on this page.
 */

const REFRESH_MS = 15_000;

/** Time left as a coarse countdown; the exact second is never the point. */
function timeLeft(endTimeSeconds) {
  const ms = endTimeSeconds * 1000 - Date.now();
  if (ms <= 0) return "closing";
  const mins = Math.floor(ms / 60000);
  const days = Math.floor(mins / 1440);
  const hours = Math.floor((mins % 1440) / 60);
  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${mins}m`;
}

const LiquidityAuction = () => {
  const { address, isConnected } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, execute, closeModal } = useTransaction();

  const [auction, setAuction] = useState(null);
  const [bid, setBid] = useState(null); // this wallet's { amount, claimed, claimable }
  const [bidBalance, setBidBalance] = useState(0);
  const [bidAmount, setBidAmount] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const refresh = () => setRefreshKey((k) => k + 1);

  const load = useCallback(async () => {
    const a = await dex.liquidityAuction();
    setAuction(a);
    if (a && address) {
      const [b, bal] = await Promise.all([
        dex.auctionBid(address),
        balance(address, a.bidDenom),
      ]);
      setBid(b);
      setBidBalance(toMacro(bal, a.bidDenom));
    } else {
      setBid(null);
      setBidBalance(0);
    }
  }, [address]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      showLoading();
      try {
        await load();
      } catch (err) {
        console.error("Error loading liquidity auction:", err);
      } finally {
        if (!cancelled) {
          setLoaded(true);
          hideLoading();
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, refreshKey]);

  // total_raised moves with every other bidder's bid, and the clearing price
  // moves with it, so a stale figure here is a bidder deciding on a price that
  // no longer exists.
  useEffect(() => {
    if (auction?.status !== dex.AUCTION_OPEN) return undefined;
    const t = setInterval(() => load().catch(console.error), REFRESH_MS);
    return () => clearInterval(t);
  }, [auction?.status, load]);

  const handleBid = () => {
    if (!isConnected || !auction) return;
    execute(async () => {
      await broadcast([
        dex.msgBidLiquidityAuction(
          address,
          auction.bidDenom,
          toMicro(bidAmount, auction.bidDenom),
        ),
      ]);
      setBidAmount("");
      refresh();
    });
  };

  const handleClaim = () => {
    if (!isConnected) return;
    execute(async () => {
      await broadcast([dex.msgClaimLiquidityAuction(address)]);
      refresh();
    });
  };

  if (!loaded) return <div className={styles.page} />;

  if (!auction) {
    return (
      <div className={styles.page}>
        <h2 className={styles.title}>Liquidity Auction</h2>
        <p className={styles.empty}>This chain has no liquidity auction.</p>
      </div>
    );
  }

  // Governance picks bid_denom when it opens the window, so a PENDING auction
  // has none and nothing here may name the pair yet.
  const bidSymbol = auction.bidDenom ? symbolOf(auction.bidDenom) : "";
  const forBidders = toMacro(auction.erthForBidders, UERTH);
  const forPool = toMacro(auction.erthForPool, UERTH);
  const raised = toMacro(auction.totalRaised, auction.bidDenom);
  // What the auction is clearing at: bidders collectively pay `raised` for
  // `forBidders`, and the pool opens at the same ratio.
  const clearingPrice = forBidders > 0 && raised > 0 ? raised / forBidders : 0;

  const myBid = bid ? toMacro(bid.amount, auction.bidDenom) : 0;
  const myClaimable = bid ? toMacro(bid.claimable, UERTH) : 0;
  // Only an estimate while the window is open: every later bid dilutes it.
  const myShare = raised > 0 ? (myBid / raised) * forBidders : 0;

  const isOpen = auction.status === dex.AUCTION_OPEN;
  const isSettled = auction.status === dex.AUCTION_SETTLED;
  const bidNum = parseFloat(bidAmount);

  return (
    <div className={styles.page}>
      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} />

      <div className={styles.header}>
        <div>
          <h2 className={styles.title}>Liquidity Auction</h2>
          <span className={styles.subtitle}>
            {bidSymbol
              ? `The genesis ERTH/${bidSymbol} market, priced by what it raises`
              : "The genesis ERTH market, priced by what it raises"}
          </span>
        </div>
        <span
          className={`${styles.status} ${
            isOpen ? styles.open : isSettled ? styles.settled : styles.pending
          }`}
        >
          {isOpen ? `Open · ${timeLeft(auction.endTime)} left` : isSettled ? "Settled" : "Not open"}
        </span>
      </div>

      <div className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Raised</span>
          <span className={styles.statVal}>
            {bidSymbol
              ? `${raised.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${bidSymbol}`
              : "--"}
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>ERTH to Bidders</span>
          <span className={styles.statVal}>{forBidders.toLocaleString()}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{isSettled ? "Cleared At" : "Clearing At"}</span>
          <span className={styles.statVal}>
            {clearingPrice > 0 && bidSymbol ? `${clearingPrice.toFixed(6)} ${bidSymbol}` : "--"}
          </span>
        </div>
      </div>

      {auction.status === dex.AUCTION_PENDING && (
        <div className={styles.card}>
          <p className={styles.note}>
            The ERTH is funded and earmarked, but no bidding window is open. Governance opens it
            with a denomination and a duration — the intended one is bridged USDC, which does not
            exist on the chain until IBC is enabled.
          </p>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Earmarked for bidders</span>
              <span className={styles.infoVal}>{forBidders.toLocaleString()} ERTH</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Earmarked for the pool</span>
              <span className={styles.infoVal}>{forPool.toLocaleString()} ERTH</span>
            </div>
          </div>
        </div>
      )}

      {isOpen && (
        <div className={styles.card}>
          <div className={styles.inputHeader}>
            <label>Bid {bidSymbol}</label>
            <span className={styles.balance}>
              Bal: {bidBalance.toLocaleString()}{" "}
              <button className={styles.maxBtn} onClick={() => setBidAmount(String(bidBalance))}>
                Max
              </button>
            </span>
          </div>
          <input
            type="number"
            placeholder="0.0"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
            className={styles.input}
          />
          <button
            className={styles.actionBtn}
            onClick={handleBid}
            disabled={!isConnected || !(bidNum > 0) || bidNum > bidBalance}
          >
            {isConnected ? "Place Bid" : "Connect a wallet to bid"}
          </button>
          {/* Bids are additive and there is no withdrawal — that is exactly what
              makes total_raised final at the close, so it has to be said before
              the button rather than after it. */}
          <p className={styles.warn}>
            Bids add to any earlier bid and cannot be withdrawn. Your share is set by what everyone
            else bids before the window closes.
          </p>

          {myBid > 0 && (
            <div className={styles.infoGrid}>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>Your bid</span>
                <span className={styles.infoVal}>
                  {myBid.toLocaleString()} {bidSymbol}
                </span>
              </div>
              <div className={styles.infoItem}>
                <span className={styles.infoLabel}>ERTH at the current price</span>
                <span className={styles.infoVal}>
                  ~{myShare.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </span>
              </div>
            </div>
          )}
        </div>
      )}

      {isSettled && (
        <div className={styles.card}>
          <div className={styles.infoGrid}>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Pool</span>
              <span className={styles.infoVal}>ERTH / {bidSymbol} (#{auction.poolId})</span>
            </div>
            <div className={styles.infoItem}>
              <span className={styles.infoLabel}>Your bid</span>
              <span className={styles.infoVal}>
                {myBid.toLocaleString()} {bidSymbol}
              </span>
            </div>
          </div>

          {myBid > 0 && (
            <>
              <div className={styles.claimRow}>
                <div>
                  <span className={styles.infoLabel}>Claimable</span>
                  <span className={styles.claimVal}>
                    {myClaimable.toLocaleString(undefined, { maximumFractionDigits: 6 })} ERTH
                  </span>
                </div>
                <button
                  className={styles.actionBtn}
                  onClick={handleClaim}
                  disabled={!isConnected || bid?.claimed || !(myClaimable > 0)}
                >
                  {bid?.claimed ? "Claimed" : "Claim ERTH"}
                </button>
              </div>
              <p className={styles.note}>
                The pool opened at the price the auction cleared at, and its liquidity is owned by
                nobody — it is retired on a schedule you can watch on the Markets page.
              </p>
            </>
          )}

          {myBid === 0 && (
            <p className={styles.note}>
              This wallet did not bid. The pool is live and tradeable like any other.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default LiquidityAuction;
