import React, { useEffect, useState } from "react";
import { query, contract } from "../utils/contractUtils";
import { ERTH_API_BASE_URL } from "../utils/config";
import { showLoadingScreen } from "../utils/uiUtils";
import { toMacroUnits } from "../utils/mathUtils";
import tokens from "../utils/tokens";
import contracts from "../utils/contracts";
import StatusModal from "../components/StatusModal";
import styles from "./WeeklyAirdropClaim.module.css";

// Airdrop contract details
const AIRDROP_CONTRACT = contracts.airdrop.contract;
const AIRDROP_HASH = contracts.airdrop.hash;

const WeeklyAirdropClaim = ({ isKeplrConnected }) => {
  const [claimData, setClaimData] = useState(null);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [roundInfo, setRoundInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  const [prices, setPrices] = useState(null);
  const [airdropAPR, setAirdropAPR] = useState(null);
  const [countdown, setCountdown] = useState("");

  useEffect(() => {
    if (isKeplrConnected) {
      fetchAirdropData();
    }
    fetchPrices();
  }, [isKeplrConnected]);

  useEffect(() => {
    const updateCountdown = () => {
      const now = new Date();
      const nextSunday = new Date(now);

      // Get current day (0 = Sunday, 1 = Monday, etc.)
      const currentDay = now.getUTCDay();

      // Calculate days until next Sunday (0)
      const daysUntilSunday = currentDay === 0 ? 7 : 7 - currentDay;

      // Set to next Sunday at midnight UTC
      nextSunday.setUTCDate(now.getUTCDate() + daysUntilSunday);
      nextSunday.setUTCHours(0, 0, 0, 0);

      const diff = nextSunday - now;

      if (diff <= 0) {
        setCountdown("00:00:00:00");
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);

      setCountdown(
        `${String(days).padStart(2, '0')}:${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      );
    };

    updateCountdown();
    const interval = setInterval(updateCountdown, 1000);

    return () => clearInterval(interval);
  }, []);

  const fetchPrices = async () => {
    try {
      const response = await fetch(`${ERTH_API_BASE_URL}/analytics`);
      if (response.ok) {
        const data = await response.json();
        setPrices(data.latest);
      }
    } catch (err) {
      console.error("Error fetching prices:", err);
    }
  };

  const calculateAirdropAPR = () => {
    if (!roundInfo || !prices) return null;

    const erthPrice = prices.erthPrice || 0;
    const scrtPrice = prices.scrtPrice || 0;

    if (erthPrice === 0 || scrtPrice === 0) return null;

    const totalStake = parseFloat(formatAmount(roundInfo.total_stake));
    const weeklyRewards = parseFloat(formatAmount(roundInfo.total_amount));

    if (totalStake === 0) return null;

    // Calculate weekly return in USD
    const weeklyRewardsUSD = weeklyRewards * erthPrice;
    const totalStakeUSD = totalStake * scrtPrice;

    // Weekly return percentage
    const weeklyReturn = (weeklyRewardsUSD / totalStakeUSD) * 100;

    // Annualize (52 weeks)
    const apr = weeklyReturn * 52;

    return apr.toFixed(2);
  };

  const fetchAirdropData = async () => {
    if (!window.secretjs || !window.secretjs.address) {
      setError("Wallet not connected");
      setLoading(false);
      return;
    }

    try {
      showLoadingScreen(true);
      setLoading(true);
      setError(null);

      const userAddress = window.secretjs.address;

      // Fetch claim data from backend API
      // Query contract for current round info first (always do this)
      const roundQuery = { get_current_round: {} };
      const roundResp = await query(AIRDROP_CONTRACT, AIRDROP_HASH, roundQuery);

      // Fetch round metadata from backend (always available)
      const metaResponse = await fetch(`${ERTH_API_BASE_URL}/airdrop/current/meta`);
      if (metaResponse.ok) {
        const metaJson = await metaResponse.json();
        setRoundInfo({ ...metaJson, ...roundResp });
      } else {
        setRoundInfo(roundResp);
      }

      const claimResponse = await fetch(
        `${ERTH_API_BASE_URL}/airdrop/current/${userAddress}`
      );

      if (!claimResponse.ok) {
        if (claimResponse.status === 404) {
          setError("No airdrop allocation found for your address");
          setLoading(false);
          showLoadingScreen(false);
          return;
        }
        throw new Error(`Failed to fetch claim data: ${claimResponse.statusText}`);
      }

      const claimJson = await claimResponse.json();
      setClaimData(claimJson);

      // Check if user has already claimed
      const hasClaimedQuery = { has_claimed: { address: userAddress } };
      const hasClaimedResp = await query(AIRDROP_CONTRACT, AIRDROP_HASH, hasClaimedQuery);
      setHasClaimed(hasClaimedResp.has_claimed);

      setLoading(false);
      showLoadingScreen(false);
    } catch (err) {
      console.error("Error fetching airdrop data:", err);
      setError(err.message || "Failed to load airdrop data");
      setLoading(false);
      showLoadingScreen(false);
    }
  };

  const handleClaim = async () => {
    if (!claimData || hasClaimed) return;

    try {
      setIsModalOpen(true);
      setAnimationState("loading");

      const claimMsg = {
        claim: {
          amount: claimData.amount,
          proof: claimData.proof,
        },
      };

      const resp = await contract(AIRDROP_CONTRACT, AIRDROP_HASH, claimMsg);

      if (resp.code === 0) {
        setAnimationState("success");
        setHasClaimed(true);
      } else {
        setAnimationState("error");
        console.error("Claim failed:", resp);
      }
    } catch (err) {
      console.error("Error claiming airdrop:", err);
      setAnimationState("error");
    } finally {
      fetchAirdropData(); // Refresh data
    }
  };

  const calculateClaimableAmount = () => {
    if (!claimData || !roundInfo) return "0";

    const stakeAmount = parseFloat(claimData.amount);
    const totalStake = parseFloat(roundInfo.total_stake);
    const totalAmount = parseFloat(roundInfo.total_amount);

    if (totalStake === 0) return "0";

    // Calculate: (stake_amount * total_amount) / total_stake
    const claimableAmount = (totalAmount * stakeAmount) / totalStake;

    return toMacroUnits(claimableAmount.toString(), tokens["ERTH"]);
  };

  const formatAmount = (microAmount) => {
    if (!microAmount) return "0";
    return toMacroUnits(microAmount, tokens["ERTH"]);
  };

  const formatDate = (dateString) => {
    if (!dateString) return "N/A";
    return new Date(dateString).toLocaleString();
  };

  if (!isKeplrConnected) {
    return (
      <div className={styles.testBox}>
        <div className={styles.message}>
          Please connect your Keplr wallet to view your airdrop allocation.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className={styles.testBox}>
        <div className={styles.message}>Loading airdrop data...</div>
      </div>
    );
  }

  return (
    <>
    <div className={styles.testBox}>
      <img
        src="/images/coin/ERTH.png"
        alt="ERTH"
        className={styles.logoImg}
      />

      {error ? (
        <div className={styles.noAirdropMessage}>
          {error}
        </div>
      ) : claimData && (
        <>
          <div className={styles.amountDisplay}>
            {calculateClaimableAmount()}
            <span className={styles.tokenSymbol}>ERTH</span>
          </div>

          {calculateAirdropAPR() && (
            <div className={styles.combinedAPRContainer}>
              <div className={styles.combinedAPR}>
                {(20.29 + parseFloat(calculateAirdropAPR())).toFixed(2)}% <span className={styles.aprText}>APR</span>
              </div>
              <div className={styles.infoIcon}>
                <i className="bx bx-info-circle"></i>
                <div className={styles.tooltip}>
                  <span className={styles.baseAPR}>20.29%</span>
                  <span className={styles.aprSubLabel}> (validator)</span>
                  <span className={styles.plusSign}> + </span>
                  <span className={styles.airdropAPR}>{calculateAirdropAPR()}%</span>
                  <span className={styles.aprSubLabel}> (airdrop)</span>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {roundInfo && (
        <div className={styles.infoText}>
          Round {roundInfo.round_id || 'N/A'} • Snapshot: {formatDate(roundInfo.generated_at || claimData?.run_generated_at)}
        </div>
      )}

      {error ? (
        <>
          <button
            className={styles.claimButton}
            onClick={() => window.open('https://wallet.keplr.app/chains/secret-network?tab=staking', '_blank')}
          >
            Stake SCRT
          </button>
          {countdown && (
            <div className={styles.countdownText}>
              Next airdrop in: <span className={styles.countdownTimer}>{countdown}</span>
            </div>
          )}
        </>
      ) : claimData && (
        hasClaimed ? (
          <>
            <div className={styles.claimedMessage}>
              Already Claimed
            </div>
            {countdown && (
              <div className={styles.countdownText}>
                Next airdrop in: <span className={styles.countdownTimer}>{countdown}</span>
              </div>
            )}
          </>
        ) : (
          <button className={styles.claimButton} onClick={handleClaim}>
            Claim Airdrop
          </button>
        )
      )}
    </div>

    <StatusModal
      isOpen={isModalOpen}
      onClose={() => setIsModalOpen(false)}
      animationState={animationState}
    />
  </>
  );
};

export default WeeklyAirdropClaim;
