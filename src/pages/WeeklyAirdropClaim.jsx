import { useEffect, useState } from "react";
import { query, contract } from "../utils/contractUtils";
import { ERTH_API_BASE_URL } from "../utils/config";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import { toMacroUnits } from "../utils/mathUtils";
import tokens from "../utils/tokens";
import contracts from "../utils/contracts";
import StatusModal from "../components/StatusModal";
import useTransaction from "../hooks/useTransaction";
import styles from "./WeeklyAirdropClaim.module.css";

const VALIDATOR_ADDRESS = "secretvaloper19g3d3ug9xwtwswq4qef890xu3j0d4r4nvpz0jd";

const WeeklyAirdropClaim = () => {
  const { isKeplrConnected } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, execute, closeModal } = useTransaction();

  const [claimData, setClaimData] = useState(null);
  const [hasClaimed, setHasClaimed] = useState(false);
  const [roundInfo, setRoundInfo] = useState(null);
  const [error, setError] = useState(null);
  const [prices, setPrices] = useState(null);
  const [countdown, setCountdown] = useState("");
  const [nextSharePercent, setNextSharePercent] = useState(null);
  const [userStake, setUserStake] = useState(null);
  const [totalStake, setTotalStake] = useState(null);
  const [showDetails, setShowDetails] = useState(false);

  useEffect(() => {
    fetchPrices();
    fetchRoundInfo();
  }, []);

  useEffect(() => {
    if (isKeplrConnected) fetchAirdropData();
  }, [isKeplrConnected]);

  useEffect(() => {
    if (isKeplrConnected && roundInfo) fetchNextShare();
  }, [isKeplrConnected, roundInfo]);

  useEffect(() => {
    const tick = () => {
      const now = new Date();
      const next = new Date(now);
      const day = now.getUTCDay();
      next.setUTCDate(now.getUTCDate() + (day === 0 ? 7 : 7 - day));
      next.setUTCHours(0, 0, 0, 0);
      const diff = next - now;
      if (diff <= 0) { setCountdown("00:00:00:00"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setCountdown(`${String(d).padStart(2,'0')}:${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  const fetchPrices = async () => {
    try {
      const r = await fetch(`${ERTH_API_BASE_URL}/analytics`);
      if (r.ok) setPrices((await r.json()).latest);
    } catch (e) { console.error(e); }
  };

  const fetchRoundInfo = async () => {
    try {
      const ac = contracts.airdrop?.contract;
      let rr = null;
      if (ac) rr = await query(ac, contracts.airdrop.hash, { get_current_round: {} });
      const mr = await fetch(`${ERTH_API_BASE_URL}/airdrop/current/meta`);
      if (mr.ok) setRoundInfo({ ...(await mr.json()), ...rr });
      else if (rr) setRoundInfo(rr);
    } catch (e) { console.error(e); }
  };

  const fetchNextShare = async () => {
    try {
      if (!window.secretjs?.address) return;
      const delegation = await window.secretjs.query.staking.delegation({
        delegator_addr: window.secretjs.address,
        validator_addr: VALIDATOR_ADDRESS,
      });
      const staked = parseFloat(delegation?.delegation_response?.balance?.amount || "0");
      const total = parseFloat(roundInfo.total_stake);
      setUserStake(staked);
      setTotalStake(total);
      if (staked > 0 && total > 0) {
        setNextSharePercent(((staked / total) * 100).toFixed(2));
      }
    } catch (e) { console.error("Error fetching delegation:", e); }
  };

  const fetchAirdropData = async (refetch = false) => {
    if (!window.secretjs?.address) return;
    try {
      if (!refetch) showLoading();
      setError(null);
      const addr = window.secretjs.address;
      const cr = await fetch(`${ERTH_API_BASE_URL}/airdrop/current/${addr}`);
      if (!cr.ok) {
        if (cr.status === 404) { setError("No allocation for current round"); if (!refetch) hideLoading(); return; }
        throw new Error(cr.statusText);
      }
      setClaimData(await cr.json());
      const hc = await query(contracts.airdrop.contract, contracts.airdrop.hash, { has_claimed: { address: addr } });
      setHasClaimed(hc.has_claimed);
      if (!refetch) hideLoading();
    } catch (e) {
      console.error(e);
      setError(e.message || "Failed to load");
      if (!refetch) hideLoading();
    }
  };

  const handleClaim = async () => {
    if (!claimData || hasClaimed) return;
    await execute(async () => {
      const resp = await contract(contracts.airdrop.contract, contracts.airdrop.hash, {
        claim: { amount: claimData.amount, proof: claimData.proof },
      });
      if (resp.code !== 0) throw new Error("Claim transaction failed");
      setHasClaimed(true);
      fetchAirdropData(true);
    });
  };

  const formatAmount = (micro) => micro ? toMacroUnits(micro, tokens["ERTH"]) : "0";

  const getClaimable = () => {
    if (!claimData || !roundInfo) return "0";
    const amt = (parseFloat(roundInfo.total_amount) * parseFloat(claimData.amount)) / parseFloat(roundInfo.total_stake);
    return parseFloat(toMacroUnits(amt.toString(), tokens["ERTH"])).toLocaleString(undefined, { maximumFractionDigits: 2 });
  };

  const getAPR = () => {
    if (!roundInfo || !prices) return null;
    const ep = prices.erthPrice || 0, sp = prices.scrtPrice || 0;
    if (!ep || !sp) return null;
    const ts = parseFloat(formatAmount(roundInfo.total_stake));
    const wr = parseFloat(formatAmount(roundInfo.total_amount));
    if (!ts) return null;
    return ((wr * ep) / (ts * sp) * 52 * 100).toFixed(1);
  };

  const apr = getAPR();

  return (
    <>
      <div className={styles.container}>
        <div className={styles.card}>
          <img src="/images/coin/ERTH.png" alt="ERTH" className={styles.logoImg} />

          {isKeplrConnected && claimData && !error ? (
            <h1 className={styles.title}>{getClaimable()} ERTH</h1>
          ) : (
            <h1 className={styles.title}>Weekly Airdrop</h1>
          )}

          {apr && <span className={styles.apr}>{(20.29 + parseFloat(apr)).toFixed(1)}% APR</span>}

          <p className={styles.countdown}>
            Next airdrop in <span className={styles.timer}>{countdown}</span>
          </p>

          {isKeplrConnected && (nextSharePercent || totalStake != null || userStake != null || roundInfo?.total_amount) && (
            <div className={styles.detailsDropdown}>
              <button className={styles.detailsToggle} onClick={() => setShowDetails(!showDetails)}>
                Info {showDetails ? "▲" : "▼"}
              </button>
              {showDetails && (
                <div className={styles.detailsContent}>
                  {userStake != null && <p>Your stake: {(userStake / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })} SCRT</p>}
                  {nextSharePercent && <p>Your share: {nextSharePercent}%</p>}
                  {nextSharePercent && roundInfo?.total_amount && <p>Estimated airdrop: {(parseFloat(formatAmount(roundInfo.total_amount)) * parseFloat(nextSharePercent) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })} ERTH</p>}
                  {roundInfo?.total_amount && <p>Airdrop pool: {parseFloat(formatAmount(roundInfo.total_amount)).toLocaleString(undefined, { maximumFractionDigits: 0 })} ERTH</p>}
                  {totalStake != null && <p>Total staked: {(totalStake / 1e6).toLocaleString(undefined, { maximumFractionDigits: 0 })} SCRT</p>}
                </div>
              )}
            </div>
          )}

          {!isKeplrConnected ? (
            <>
              <button
                className={styles.button}
                onClick={() => window.open(`https://wallet.keplr.app/chains/secret-network?modal=validator&chain=secret-4&validator_address=${VALIDATOR_ADDRESS}`, '_blank')}
              >
                Stake SCRT
              </button>
              <p className={styles.sub}>Connect wallet to check your allocation</p>
            </>
          ) : error ? (
            <>
              <button
                className={styles.button}
                onClick={() => window.open(`https://wallet.keplr.app/chains/secret-network?modal=validator&chain=secret-4&validator_address=${VALIDATOR_ADDRESS}`, '_blank')}
              >
                Stake SCRT
              </button>
              <p className={styles.sub}>{error}</p>
            </>
          ) : hasClaimed ? (
            <div className={styles.claimed}>Already Claimed</div>
          ) : claimData ? (
            <button className={styles.button} onClick={handleClaim}>
              Claim Airdrop
            </button>
          ) : null}
        </div>
      </div>

      <StatusModal isOpen={isModalOpen} onClose={closeModal} animationState={animationState} />
    </>
  );
};

export default WeeklyAirdropClaim;
