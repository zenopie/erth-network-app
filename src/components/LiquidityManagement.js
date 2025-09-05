import React, { useState, useEffect, useCallback } from 'react';
import styles from './LiquidityManagement.module.css';
import {
  query,
  querySnipBalance,
  provideLiquidity,
  snip,
  contract,
  requestViewingKey
} from '../utils/contractUtils';
import { toMicroUnits, toMacroUnits } from '../utils/mathUtils';
import tokens from '../utils/tokens';
import contracts from '../utils/contracts.js';
import StatusModal from '../components/StatusModal';

// Hardcoded 10-minute unbond period (adjust as needed).
const UNBOND_SECONDS = 600; // 10 minutes

const LiquidityManagement = ({
  isKeplrConnected,
  toggleManageLiquidity,
  poolData,         // { pool_info, user_info, tokenKey }
}) => {
  // Tabs
  const [activeTab, setActiveTab] = useState('Info');

  // Add liquidity fields
  const [erthAmount, setErthAmount] = useState('');
  const [tokenBAmount, setTokenBAmount] = useState('');

  // Remove liquidity fields
  const [removeAmount, setRemoveAmount] = useState('');
  const [unbondRequests, setUnbondRequests] = useState([]);

  // UI states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState('loading');

  // Local pool state (replacing prop dependency)
  const [poolInfo, setPoolInfo] = useState(poolData?.pool_info || {});
  const [userInfo, setUserInfo] = useState(poolData?.user_info || {});
  const tokenKey = poolData?.tokenKey || '';
  const tokenErth = tokens.ERTH;
  const tokenB = tokens[tokenKey];

  // Reserves and staked amounts (now derived from local state)
  const erthReserve = Number(poolInfo?.state?.erth_reserve || 0);
  const tokenBReserve = Number(poolInfo?.state?.token_b_reserve || 0);
  const stakedAmount = toMacroUnits(
    userInfo?.amount_staked || '0',
    tokenB
  );

  // Local SNIP-20 balances
  const [erthBalance, setErthBalance] = useState(null);
  const [tokenBBalance, setTokenBBalance] = useState(null);

  // -------------------- Fetch Unbond Requests --------------------
  const refreshUnbondRequests = useCallback(async () => {
    if (!isKeplrConnected || !tokenB?.contract) return;
    try {
      const exchangeContract = contracts.exchange.contract;
      const exchangeHash = contracts.exchange.hash;
      const msg = {
        query_unbonding_requests: {
          pool: tokenB.contract,
          user: window.secretjs.address,
        },
      };
      const resp = await query(exchangeContract, exchangeHash, msg);
      setUnbondRequests(resp || []);
    } catch (err) {
      console.error("[LiquidityManagement] Error fetching unbond requests:", err);
    }
  }, [isKeplrConnected, tokenB]);

  useEffect(() => {
    refreshUnbondRequests();
  }, [refreshUnbondRequests]);

  // -------------------- Fetch NORTH-20 Balances --------------------
  const refreshSnipBalances = useCallback(async () => {
    if (!isKeplrConnected || !tokenKey) return;
    try {
      const erthBal = await querySnipBalance(tokenErth);
      setErthBalance(erthBal);

      const tBal = await querySnipBalance(tokenB);
      setTokenBBalance(tBal);
    } catch (err) {
      console.error("[LiquidityManagement] Error fetching NORTH-20 balances:", err);
    }
  }, [isKeplrConnected, tokenErth, tokenB, tokenKey]);

  // -------------------- Query Pool Data --------------------
  const refreshPoolData = useCallback(async () => {
    if (!isKeplrConnected || !tokenB?.contract) return;
    try {
      const msg = {
        query_user_info: {
          pools: [tokenB.contract],
          user: window.secretjs.address,
        },
      };
      const result = await query(contracts.exchange.contract, contracts.exchange.hash, msg);
      const updatedData = result[0];
      if (updatedData) {
        setPoolInfo(updatedData.pool_info || {});
        setUserInfo(updatedData.user_info || {});
        await refreshSnipBalances(); // Also refresh balances
      }
    } catch (err) {
      console.error("[LiquidityManagement] Error refreshing pool data:", err);
    }
  }, [isKeplrConnected, tokenB, refreshSnipBalances]);

  // Run on mount
  useEffect(() => {
    refreshSnipBalances();
    refreshPoolData(); // Initial fetch to ensure latest data
  }, [refreshSnipBalances, refreshPoolData]);

  // -------------------- Add Liquidity --------------------
  const handleAddLiquidity = async () => {
    if (!isKeplrConnected) return;

    try {
      setIsModalOpen(true);
      setAnimationState('loading');

      await provideLiquidity(
        tokenErth.contract,
        tokenErth.hash,
        tokenB.contract,
        tokenB.hash,
        toMicroUnits(erthAmount, tokenErth),
        toMicroUnits(tokenBAmount, tokenB)
      );

      await refreshPoolData();
      setErthAmount('');
      setTokenBAmount('');
      setAnimationState('success');
    } catch (error) {
      console.error("[LiquidityManagement] Error adding liquidity:", error);
      setAnimationState('error');
    }
  };

  // -------------------- Remove Liquidity --------------------
  const handleRemoveLiquidity = async () => {
    if (!isKeplrConnected) return;

    try {
      setIsModalOpen(true);
      setAnimationState('loading');

      const inputAmount = toMicroUnits(removeAmount, tokenB);
      const msg = {
        remove_liquidity: {
          pool: tokenB.contract,
          amount: inputAmount.toString(),
        },
      };

      await contract(
        contracts.exchange.contract,
        contracts.exchange.hash,
        msg
      );

      await refreshPoolData();
      setRemoveAmount('');
      setAnimationState('success');
    } catch (error) {
      console.error("[LiquidityManagement] Error removing liquidity:", error);
      setAnimationState('error');
    }
  };



  // -------------------- Complete Unbond --------------------
  const handleCompleteUnbond = async () => {
    if (!isKeplrConnected) return;

    try {
      setIsModalOpen(true);
      setAnimationState('loading');

      const msg = {
        claim_unbond_liquidity: {
          pool: tokenB.contract, 
        },
      };

      await contract(contracts.exchange.contract, contracts.exchange.hash, msg);

      await refreshPoolData();
      await refreshUnbondRequests();
      setAnimationState('success');
    } catch (error) {
      console.error("[LiquidityManagement] Error completing unbond:", error);
      setAnimationState('error');
    }
  };

  // -------------------- Ratio sync: ERTH => tokenB --------------------
  const handleErthChange = (e) => {
    const val = e.target.value;
    setErthAmount(val);
    const parsed = parseFloat(val);

    if (!isNaN(parsed) && erthReserve && tokenBReserve) {
      const tokenBEquiv = (parsed * tokenBReserve) / erthReserve;
      setTokenBAmount(tokenBEquiv.toFixed(6));
    } else {
      setTokenBAmount('');
    }
  };

  // -------------------- Ratio sync: tokenB => ERTH --------------------
  const handleTokenBChange = (e) => {
    const val = e.target.value;
    setTokenBAmount(val);
    const parsed = parseFloat(val);

    if (!isNaN(parsed) && erthReserve && tokenBReserve) {
      const erthEquiv = (parsed * erthReserve) / tokenBReserve;
      setErthAmount(erthEquiv.toFixed(6));
    } else {
      setErthAmount('');
    }
  };

  // -------------------- "Max" Buttons --------------------
  const handleMaxErthAmount = () => {
    if (erthBalance && !isNaN(erthBalance)) {
      setErthAmount(erthBalance);
      handleErthChange({ target: { value: erthBalance } });
    }
  };
  const handleMaxTokenBAmount = () => {
    if (tokenBBalance && !isNaN(tokenBBalance)) {
      setTokenBAmount(tokenBBalance);
      handleTokenBChange({ target: { value: tokenBBalance } });
    }
  };
  const handleMaxRemoveAmount = () => {
    if (stakedAmount && !isNaN(stakedAmount)) {
      setRemoveAmount(stakedAmount);
    }
  };

  // -------------------- Viewing Key if needed --------------------
  const handleRequestViewingKey = async (token) => {
    await requestViewingKey(token);
    refreshSnipBalances();
  };

  // -------------------- Pool Calculations for Remove Tab --------------------
  const totalShares = Number(poolInfo?.state?.total_shares || 0);
  const userStakedShares = Number(userInfo?.amount_staked || 0);
  
  const poolOwnershipPercent = totalShares > 0 ? (userStakedShares / totalShares) * 100 : 0;
  
  // Calculate approximate underlying token values
  const userErthValue = poolOwnershipPercent > 0 ? (toMacroUnits(erthReserve, tokens.ERTH) * poolOwnershipPercent) / 100 : 0;
  const userTokenBValue = poolOwnershipPercent > 0 ? (toMacroUnits(tokenBReserve, tokenB) * poolOwnershipPercent) / 100 : 0;

  // ----------------------------------------------------------------
  const hasClaimableUnbond = unbondRequests.some((req) => {
    const claimableAt = (req.start_time + UNBOND_SECONDS) * 1000;
    return Date.now() >= claimableAt;
  });

  return (
    <div className={styles.box}>
      <StatusModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        animationState={animationState}
      />

      <h2>Manage Liquidity</h2>
      <div
        className={styles.closeButton}
        onClick={toggleManageLiquidity}
      >
        X
      </div>

      <div className={styles.tab}>
        <button
          className={activeTab === 'Info' ? styles.active : ''}
          onClick={() => setActiveTab('Info')}
        >
          Info
        </button>
        <button
          className={activeTab === 'Add' ? styles.active : ''}
          onClick={() => setActiveTab('Add')}
        >
          Add
        </button>
        <button
          className={activeTab === 'Remove' ? styles.active : ''}
          onClick={() => setActiveTab('Remove')}
        >
          Remove
        </button>
        <button
          className={activeTab === 'Unbond' ? styles.active : ''}
          onClick={() => setActiveTab('Unbond')}
        >
          Unbond
        </button>
      </div>

      {/* ===================== Info Tab ===================== */}
      {activeTab === 'Info' && (
        <div className={styles.tabContent}>
          <h3 className={styles.poolInfoTitle}>Pool Information</h3>
          <div className={styles.poolStatsGrid}>
            <div className={styles.poolStatItem}>
              <span className={styles.poolStatLabel}>Total Pool Shares:</span>
              <span className={styles.poolStatValue}>{totalShares.toLocaleString()}</span>
            </div>
            <div className={styles.poolStatItem}>
              <span className={styles.poolStatLabel}>Your Shares:</span>
              <span className={styles.poolStatValue}>{userStakedShares.toLocaleString()}</span>
            </div>
            <div className={styles.poolStatItem}>
              <span className={styles.poolStatLabel}>Pool Ownership:</span>
              <span className={styles.poolStatValue}>{poolOwnershipPercent.toFixed(4)}%</span>
            </div>
          </div>
          
          <h4>Approximate Underlying Value</h4>
          <div className={styles.underlyingValueGrid}>
            <div className={styles.underlyingValueItem}>
              <span className={styles.underlyingValueLabel}>ERTH:</span>
              <span className={styles.underlyingValueAmount}>{userErthValue.toFixed(6)}</span>
            </div>
            <div className={styles.underlyingValueItem}>
              <span className={styles.underlyingValueLabel}>{tokenKey}:</span>
              <span className={styles.underlyingValueAmount}>{userTokenBValue.toFixed(6)}</span>
            </div>
          </div>
        </div>
      )}

      {/* ===================== Add Tab ===================== */}
      {activeTab === 'Add' && (
        <div className={styles.tabContent}>
          {/* tokenB input */}
          <div className={styles.inputGroup}>
            <div className={styles.labelWrapper}>
              <label>{tokenKey}</label>
              <div className={styles.balanceContainer}>
                {tokenBBalance === 'Error' ? (
                  <button className={styles.maxButton} onClick={() => handleRequestViewingKey(tokenB)}>
                    Get Viewing Key
                  </button>
                ) : (
                  <>
                    Balance: {tokenBBalance ?? '...'}
                    <button className={styles.maxButton} onClick={handleMaxTokenBAmount}>
                      Max
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className={styles.inputWrapper}>
              {tokenB?.logo && (
                <img
                  src={tokenB.logo}
                  alt={`${tokenKey} logo`}
                  className={styles.inputLogo}
                />
              )}
              <input
                type="text"
                value={tokenBAmount}
                onChange={handleTokenBChange}
                placeholder={`Amount of ${tokenKey}`}
                className={styles.input}
              />
            </div>
          </div>

          {/* ERTH input */}
          <div className={styles.inputGroup}>
            <div className={styles.labelWrapper}>
              <label>ERTH</label>
              <div className={styles.balanceContainer}>
                {erthBalance === 'Error' ? (
                  <button className={styles.maxButton} onClick={() => handleRequestViewingKey(tokenErth)}>
                    Get Viewing Key
                  </button>
                ) : (
                  <>
                    Balance: {erthBalance ?? '...'}
                    <button className={styles.maxButton} onClick={handleMaxErthAmount}>
                      Max
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className={styles.inputWrapper}>
              {tokenErth?.logo && (
                <img
                  src={tokenErth.logo}
                  alt="ERTH logo"
                  className={styles.inputLogo}
                />
              )}
              <input
                type="text"
                value={erthAmount}
                onChange={handleErthChange}
                placeholder="Amount of ERTH"
                className={styles.input}
              />
            </div>
          </div>

          <button className={styles.button} onClick={handleAddLiquidity}>
            Add Liquidity
          </button>
        </div>
      )}

      {/* ===================== Remove Tab ===================== */}
      {activeTab === 'Remove' && (
        <div className={styles.tabContent}>
          <div className={styles.inputGroup}>
            <div className={styles.labelWrapper}>
              <label>Remove Liquidity</label>
              <div className={styles.balanceContainer}>
                <>
                  Staked: {stakedAmount ?? '...'}
                  <button className={styles.maxButton} onClick={handleMaxRemoveAmount}>
                    Max
                  </button>
                </>
              </div>
            </div>
            <div className={styles.inputWrapper}>
              <input
                type="text"
                value={removeAmount}
                onChange={(e) => setRemoveAmount(e.target.value)}
                placeholder="Amount to Remove"
                className={styles.input}
              />
            </div>
          </div>

          <button className={styles.button} onClick={handleRemoveLiquidity}>
            Remove Liquidity
          </button>
        </div>
      )}

      {/* ===================== Unbond Tab ===================== */}
      {activeTab === 'Unbond' && (
        <div className={styles.tabContent}>
          {hasClaimableUnbond && (
            <button
              className={styles.button}
              onClick={handleCompleteUnbond}
              style={{ marginTop: '10px' }}
            >
              Complete Unbond
            </button>
          )}

          {unbondRequests.length > 0 && (
            <div className={styles.unbondingRequests}>
              <h3>Unbonding Requests</h3>
              <ul>
                {unbondRequests.map((req, i) => {
                  const claimableAt = (req.start_time + UNBOND_SECONDS) * 1000;
                  return (
                    <li key={i}>
                      Amount: {toMacroUnits(req.amount, tokenB)} tokens,
                      <br />
                      Claimable at: {new Date(claimableAt).toLocaleString()}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LiquidityManagement;