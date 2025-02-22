import React, { useState, useEffect, useCallback } from 'react';
import './LiquidityManagement.css';
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
  refreshParent
}) => {

  // Tabs
  const [activeTab, setActiveTab] = useState('Provide');

  // Provide tab fields
  const [erthAmount, setErthAmount] = useState('');
  const [tokenBAmount, setTokenBAmount] = useState('');

  // Stake tab fields
  const [lpTokenAmount, setLpTokenAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');

  // Unbond tab fields
  const [unbondAmount, setUnbondAmount] = useState('');
  const [unbondRequests, setUnbondRequests] = useState([]);

  // UI states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState('loading');
  const [provideStake, setProvideStake] = useState(true);
  const [unstakeUnbond, setUnstakeUnbond] = useState(true);

  // Extract from parent
  const { pool_info, user_info, tokenKey } = poolData || {};
  const tokenErth = tokens.ERTH;
  const tokenB = tokens[tokenKey];

  // Reserves, staked amounts
  const erthReserve = Number(pool_info?.state?.erth_reserve || 0);
  const tokenBReserve = Number(pool_info?.state?.token_b_reserve || 0);
  
  const stakedLpTokenBalance = toMacroUnits(
    user_info?.amount_staked || '0',
    tokenB.lp
  );


  // Local SNIP-20 balances
  const [erthBalance, setErthBalance] = useState(null);
  const [tokenBBalance, setTokenBBalance] = useState(null);
  const [lpTokenWalletBalance, setLpTokenWalletBalance] = useState(null);

  // -------------------- Fetch Unbond Requests --------------------
  useEffect(() => {
    if (!isKeplrConnected || !poolData) return;

    const fetchUnbondRequests = async () => {
      try {
        // We assume unbond data is in the "exchange" contract
        const exchangeContract = contracts.exchange.contract;
        const exchangeHash = contracts.exchange.hash;

        // Example query message:
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
    };

    fetchUnbondRequests();
  }, [isKeplrConnected, poolData, tokenB]);

  // -------------------- Fetch SNIP-20 Balances --------------------
  const refreshSnipBalances = useCallback(async () => {
    if (!isKeplrConnected) return;
    try {
      const erthBal = await querySnipBalance(tokenErth);
      setErthBalance(erthBal);

      const tBal = await querySnipBalance(tokenB);
      setTokenBBalance(tBal);

      const lpBal = await querySnipBalance(tokenB.lp);
      setLpTokenWalletBalance(lpBal);

    } catch (err) {
      console.error("[LiquidityManagement] Error fetching SNIP-20 balances:", err);
    }
  }, [isKeplrConnected, tokenErth, tokenB]);

  // Run on mount & whenever poolData changes
  useEffect(() => {
    refreshSnipBalances();
  }, [refreshSnipBalances, poolData]);

  // -------------------- Provide Liquidity --------------------
  const handleProvideLiquidity = async () => {
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
        toMicroUnits(tokenBAmount, tokenB),
        provideStake // true => auto-stake LP
      );

      setAnimationState('success');
      setErthAmount('');
      setTokenBAmount('');
      refreshParent();
      refreshSnipBalances();
    } catch (error) {
      console.error("[LiquidityManagement] Error providing liquidity:", error);
      setAnimationState('error');
    }
  };

  // -------------------- Stake from wallet --------------------
  const handleStakeLpTokens = async () => {
    if (!isKeplrConnected) return;

    try {
      setIsModalOpen(true);
      setAnimationState('loading');

      const inputAmount = toMicroUnits(lpTokenAmount, tokenB.lp);
      const snipMsg = { deposit_lp_tokens: {
        pool: tokenB.contract
      } };

      await snip(
        tokenB.lp.contract,
        tokenB.lp.hash,
        contracts.exchange.contract,
        contracts.exchange.hash,
        snipMsg,
        inputAmount
      );

      setAnimationState('success');
      setLpTokenAmount('');
      refreshParent();
      refreshSnipBalances();
    } catch (error) {
      console.error("[LiquidityManagement] Error staking LP:", error);
      setAnimationState('error');
    }
  };

  // -------------------- Unstake staked LP --------------------
  const handleUnstakeLpTokens = async () => {
    if (!isKeplrConnected) return;

    try {
      setIsModalOpen(true);
      setAnimationState('loading');

      const inputAmount = toMicroUnits(unstakeAmount, tokenB.lp);
      const msg = {
        withdraw_lp_tokens: {
          pool: tokenB.contract,
          amount: inputAmount.toString(),
          unbond: unstakeUnbond
        },
      };

      await contract(
        contracts.exchange.contract,
        contracts.exchange.hash,
        msg
      );

      setAnimationState('success');
      setUnstakeAmount('');
      refreshParent();
      refreshSnipBalances();
    } catch (error) {
      console.error("[LiquidityManagement] Error unstaking LP:", error);
      setAnimationState('error');
    }
  };

  // -------------------- Create Unbond Request from Wallet --------------------
  const handleCreateUnbondRequest = async () => {
    if (!isKeplrConnected) return;

    try {
      setIsModalOpen(true);
      setAnimationState('loading');

      const inputAmount = toMicroUnits(unbondAmount, tokenB.lp);
      const snipMsg = {
        withdraw_liquidity: {
          pool: tokenB.contract,
          amount: inputAmount.toString(),
          unbond: true,
        },
      };


      await snip(
        tokenB.lp.contract,
        tokenB.lp.hash,
        tokenB.contract,
        tokenB.poolHash,
        snipMsg,
        inputAmount
      );

      setAnimationState('success');
      setUnbondAmount('');
      refreshParent();
      refreshSnipBalances();
    } catch (error) {
      console.error("[LiquidityManagement] Error creating unbond request:", error);
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

      setAnimationState('success');
      refreshParent();
      refreshSnipBalances();
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
  const handleMaxLpTokenWalletBalance = () => {
    if (lpTokenWalletBalance && !isNaN(lpTokenWalletBalance)) {
      setLpTokenAmount(lpTokenWalletBalance);
    }
  };
  const handleMaxStakedLpTokenBalance = () => {
    if (stakedLpTokenBalance && !isNaN(stakedLpTokenBalance)) {
      setUnstakeAmount(stakedLpTokenBalance);
    }
  };
  const handleMaxUnbondAmount = () => {
    if (lpTokenWalletBalance && !isNaN(lpTokenWalletBalance)) {
      setUnbondAmount(lpTokenWalletBalance);
    }
  };

  // -------------------- Viewing Key if needed --------------------
  const handleRequestViewingKey = async (token) => {
    await requestViewingKey(token);
    refreshSnipBalances();
  };

  // ----------------------------------------------------------------
  return (
    <div className="liquidity-management-box">
      <StatusModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        animationState={animationState}
      />

      <h2>Manage Liquidity</h2>
      <div
        className="liquidity-management-close-button"
        onClick={toggleManageLiquidity}
      >
        X
      </div>

      <div className="liquidity-management-tab">
        <button
          className={`tablinks ${activeTab === 'Provide' ? 'active' : ''}`}
          onClick={() => setActiveTab('Provide')}
        >
          Provide
        </button>
        <button
          className={`tablinks ${activeTab === 'Stake' ? 'active' : ''}`}
          onClick={() => setActiveTab('Stake')}
        >
          Stake
        </button>
        <button
          className={`tablinks ${activeTab === 'Unbond' ? 'active' : ''}`}
          onClick={() => setActiveTab('Unbond')}
        >
          Unbond
        </button>
      </div>

      {/* ===================== Provide Tab ===================== */}
      {activeTab === 'Provide' && (
        <div className="liquidity-management-tabcontent">
          {/* tokenB input */}
          <div className="liquidity-management-input-group">
            <div className="liquidity-management-label-wrapper">
              <label>{tokenKey}</label>
              <div className="balance-container">
                {tokenBBalance === 'Error' ? (
                  <button className="max-button" onClick={() => handleRequestViewingKey(tokenB)}>
                    Get Viewing Key
                  </button>
                ) : (
                  <>
                    Balance: {tokenBBalance ?? 'N/A'}
                    <button className="max-button" onClick={handleMaxTokenBAmount}>
                      Max
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="liquidity-management-input-wrapper">
              {tokenB.logo && (
                <img
                  src={tokenB.logo}
                  alt={`${tokenKey} logo`}
                  className="liquidity-management-input-logo"
                />
              )}
              <input
                type="text"
                value={tokenBAmount}
                onChange={handleTokenBChange}
                placeholder={`Amount of ${tokenKey}`}
                className="liquidity-management-input"
              />
            </div>
          </div>

          {/* ERTH input */}
          <div className="liquidity-management-input-group">
            <div className="liquidity-management-label-wrapper">
              <label>ERTH</label>
              <div className="balance-container">
                {erthBalance === 'Error' ? (
                  <button className="max-button" onClick={() => handleRequestViewingKey(tokenErth)}>
                    Get Viewing Key
                  </button>
                ) : (
                  <>
                    Balance: {erthBalance ?? 'N/A'}
                    <button className="max-button" onClick={handleMaxErthAmount}>
                      Max
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="liquidity-management-input-wrapper">
              {tokenErth.logo && (
                <img
                  src={tokenErth.logo}
                  alt="ERTH logo"
                  className="liquidity-management-input-logo"
                />
              )}
              <input
                type="text"
                value={erthAmount}
                onChange={handleErthChange}
                placeholder="Amount of ERTH"
                className="liquidity-management-input"
              />
            </div>
          </div>

          <div className="toggle-switch-container">
            <label className="switch">
              <input
                type="checkbox"
                checked={provideStake}
                onChange={() => setProvideStake(!provideStake)}
              />
              <span className="slider-toggle"></span>
            </label>
            <span className="toggle-label">
              {provideStake ? 'Stake LP Tokens' : 'Create LP Tokens'}
            </span>
          </div>

          <button className="liquidity-management-button" onClick={handleProvideLiquidity}>
            Provide Liquidity
          </button>
        </div>
      )}

      {/* ===================== Stake Tab ===================== */}
      {activeTab === 'Stake' && (
        <div className="liquidity-management-tabcontent">
          {/* Stake from wallet */}
          <div className="liquidity-management-input-group">
            <div className="liquidity-management-label-wrapper">
              <label>Deposit LP Tokens</label>
              <div className="balance-container">
                {lpTokenWalletBalance === 'Error' ? (
                  <button className="max-button" onClick={() => handleRequestViewingKey(tokenB.lp)}>
                    Get Viewing Key
                  </button>
                ) : (
                  <>
                    Balance: {lpTokenWalletBalance ?? 'N/A'}
                    <button className="max-button" onClick={handleMaxLpTokenWalletBalance}>
                      Max
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="liquidity-management-input-wrapper">
              {tokenB.lp?.logo && (
                <img
                  src={tokenB.lp.logo}
                  alt={`${tokenKey} LP logo`}
                  className="liquidity-management-input-logo"
                />
              )}
              <input
                type="text"
                value={lpTokenAmount}
                onChange={(e) => setLpTokenAmount(e.target.value)}
                placeholder="Amount of LP Tokens to Stake"
                className="liquidity-management-input"
              />
            </div>
          </div>

          <button className="liquidity-management-button" onClick={handleStakeLpTokens}>
            Stake LP
          </button>

          {/* Unstake from staked */}
          <div className="liquidity-management-input-group">
            <div className="liquidity-management-label-wrapper">
              <label>Withdraw Staked LP</label>
              <div className="balance-container">
                {stakedLpTokenBalance === 'Error' ? (
                  <button className="max-button" onClick={() => handleRequestViewingKey(contracts.exchange.contract)}>
                    Get Viewing Key
                  </button>
                ) : (
                  <>
                    Balance: {stakedLpTokenBalance ?? 'N/A'}
                    <button className="max-button" onClick={handleMaxStakedLpTokenBalance}>
                      Max
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="liquidity-management-input-wrapper">
              <input
                type="text"
                value={unstakeAmount}
                onChange={(e) => setUnstakeAmount(e.target.value)}
                placeholder="Amount of LP Tokens to Withdraw"
                className="liquidity-management-input"
              />
            </div>
          </div>

          <div className="toggle-switch-container">
            <label className="switch">
              <input
                type="checkbox"
                checked={unstakeUnbond}
                onChange={() => setUnstakeUnbond(!unstakeUnbond)}
              />
              <span className="slider-toggle"></span>
            </label>
            <span className="toggle-label">
              {unstakeUnbond ? 'Create Unbond Request' : 'Withdraw LP Tokens'}
            </span>
          </div>

          <button className="liquidity-management-button" onClick={handleUnstakeLpTokens}>
            Withdraw Staked LP
          </button>
        </div>
      )}

      {/* ===================== Unbond Tab ===================== */}
      {activeTab === 'Unbond' && (
        <div className="liquidity-management-tabcontent">
          {/* Unbond from wallet */}
          <div className="liquidity-management-input-group">
            <div className="liquidity-management-label-wrapper">
              <label>Wallet LP Tokens</label>
              <div className="balance-container">
                {lpTokenWalletBalance === 'Error' ? (
                  <button className="max-button" onClick={() => handleRequestViewingKey(tokenB.lp)}>
                    Get Viewing Key
                  </button>
                ) : (
                  <>
                    Balance: {lpTokenWalletBalance ?? 'N/A'}
                    <button className="max-button" onClick={handleMaxUnbondAmount}>
                      Max
                    </button>
                  </>
                )}
              </div>
            </div>
            <div className="liquidity-management-input-wrapper">
              <input
                type="text"
                value={unbondAmount}
                onChange={(e) => setUnbondAmount(e.target.value)}
                placeholder="Amount of LP Tokens to Unbond"
                className="liquidity-management-input"
              />
            </div>
          </div>

          <button className="liquidity-management-button" onClick={handleCreateUnbondRequest}>
            Create Unbond Request
          </button>

          <button
            className="liquidity-management-button"
            onClick={handleCompleteUnbond}
            style={{ marginTop: '10px' }}
          >
            Complete Unbond
          </button>

          {unbondRequests.length > 0 && (
            <div className="unbonding-requests">
              <h3>Unbonding Requests</h3>
              <ul>
                {unbondRequests.map((req, i) => {
                  const claimableAt = (req.start_time + UNBOND_SECONDS) * 1000;
                  return (
                    <li key={i}>
                      Amount: {toMacroUnits(req.amount, tokenB.lp)} LP,
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
