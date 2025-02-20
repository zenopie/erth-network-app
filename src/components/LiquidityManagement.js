import React, { useState, useEffect, useCallback } from 'react';
import './LiquidityManagement.css';
import { 
  query, 
  provideLiquidity, 
  querySnipBalance, 
  snip, 
  contract, 
  requestViewingKey 
} from '../utils/contractUtils';
import tokens from '../utils/tokens';
import contracts from '../utils/contracts.js';
import { toMicroUnits, toMacroUnits } from '../utils/mathUtils';
import StatusModal from '../components/StatusModal';

const LiquidityManagement = ({ isKeplrConnected, toggleManageLiquidity, poolInfo }) => {
  // Tabs: Provide, Stake, Unbond
  const [activeTab, setActiveTab] = useState('Provide');

  // Provide tab inputs
  const [erthAmount, setErthAmount] = useState('');
  const [tokenBAmount, setTokenBAmount] = useState('');
  // Stake tab inputs
  const [lpTokenAmount, setLpTokenAmount] = useState('');
  const [unstakeAmount, setUnstakeAmount] = useState('');
  // Unbond tab input (from wallet LP tokens)
  const [unbondAmount, setUnbondAmount] = useState('');

  const [reserves, setReserves] = useState({});
  const [erthBalance, setErthBalance] = useState(null);
  const [tokenBBalance, setTokenBBalance] = useState(null);
  const [lpTokenWalletBalance, setLpTokenWalletBalance] = useState(null);
  const [stakedLpTokenBalance, setStakedLpTokenBalance] = useState(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState('loading'); // 'loading', 'success', 'error'
  const [unbondingRequests, setUnbondingRequests] = useState([]);

  // Toggle switches
  // In Provide: true = auto-stake (“Stake LP”), false = just create LP tokens.
  const [provideStake, setProvideStake] = useState(true);
  // In Stake: for unstaking staked tokens – true = create an unbonding request, false = immediate unstake.
  const [unstakeUnbond, setUnstakeUnbond] = useState(true);

  // Tokens
  const tokenErthKey = 'ERTH';
  const tokenBKey = poolInfo.tokenKey;
  const tokenErth = tokens[tokenErthKey];
  const tokenB = tokens[tokenBKey];

  // Use exchange contract for staking/unstaking and claim operations.
  const stakingContract = contracts.exchange.contract;
  const stakingHash = contracts.exchange.hash;

  const fetchBalancesAndReserves = useCallback(async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr is not connected.");
      return;
    }
    if (poolInfo) {
      const amountStaked = toMacroUnits(poolInfo.user_info.amount_staked, tokenB.lp);
      setStakedLpTokenBalance(amountStaked);
    }
    try {
      const erthBal = await querySnipBalance(tokenErth);
      setErthBalance(erthBal);
      const tokenBBal = await querySnipBalance(tokenB);
      setTokenBBalance(tokenBBal);
      const lpWalletBal = await querySnipBalance(tokenB.lp);
      setLpTokenWalletBalance(lpWalletBal);

      const poolDetails = { poolContract: tokenB.poolContract, poolHash: tokenB.poolHash };
      const resp = await query(poolDetails.poolContract, poolDetails.poolHash, { query_state: {} });
      const stateInfo = resp.state;
      if (stateInfo) {
        setReserves({
          erthReserve: parseInt(stateInfo.token_erth_reserve),
          tokenBReserve: parseInt(stateInfo.token_b_reserve),
        });
      } else {
        console.warn("No state information available from the pool query.");
      }
    } catch (err) {
      console.error("Error fetching data:", err);
      setErthBalance("Error");
      setTokenBBalance("Error");
      setLpTokenWalletBalance("Error");
      setStakedLpTokenBalance("Error");
    }
  }, [isKeplrConnected, poolInfo, tokenErth, tokenB]);

  const fetchUnbondingRequests = useCallback(async () => {
    if (!isKeplrConnected || !poolInfo) return;
    try {
      const resp = await query(tokenB.poolContract, tokenB.poolHash, { query_unbond_requests: { user: window.secretjs.address } });
      setUnbondingRequests(resp.requests || []);
    } catch (error) {
      console.error("Error fetching unbonding requests:", error);
    }
  }, [isKeplrConnected, poolInfo, tokenB]);

  useEffect(() => {
    fetchBalancesAndReserves();
    fetchUnbondingRequests();
  }, [fetchBalancesAndReserves, fetchUnbondingRequests]);

  const handleRequestViewingKey = async (token) => {
    await requestViewingKey(token);
    fetchBalancesAndReserves();
  };

  // Provide tab handlers
  const handleErthChange = (e) => {
    const value = e.target.value;
    setErthAmount(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && reserves.erthReserve && reserves.tokenBReserve) {
      const tokenBEquiv = (parsed * reserves.tokenBReserve) / reserves.erthReserve;
      setTokenBAmount(tokenBEquiv.toFixed(6));
    } else {
      setTokenBAmount('');
    }
  };

  const handleTokenBChange = (e) => {
    const value = e.target.value;
    setTokenBAmount(value);
    const parsed = parseFloat(value);
    if (!isNaN(parsed) && reserves.erthReserve && reserves.tokenBReserve) {
      const erthEquiv = (parsed * reserves.erthReserve) / reserves.tokenBReserve;
      setErthAmount(erthEquiv.toFixed(6));
    } else {
      setErthAmount('');
    }
  };

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

  // Stake tab handlers
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

  // Unbond tab handler (for wallet LP tokens)
  const handleMaxUnbondAmount = () => {
    if (lpTokenWalletBalance && !isNaN(lpTokenWalletBalance)) {
      setUnbondAmount(lpTokenWalletBalance);
    }
  };

  // Provide: supply liquidity
  const handleProvideLiquidity = async () => {
    if (!isKeplrConnected) return;
    const tokenErthContract = tokenErth.contract;
    const tokenErthHash = tokenErth.hash;
    const tokenBContract = tokenB.contract;
    const tokenBHash = tokenB.hash;
    try {
      setIsModalOpen(true);
      setAnimationState('loading');
      const microErth = toMicroUnits(erthAmount, tokenErth);
      const microTokenB = toMicroUnits(tokenBAmount, tokenB);
      await provideLiquidity(
        tokenErthContract,
        tokenErthHash,
        tokenBContract,
        tokenBHash,
        microErth,
        microTokenB,
        provideStake // true = auto-stake LP tokens; false = create LP tokens
      );
      console.log("Liquidity provided successfully!");
      setAnimationState('success');
      setErthAmount('');
      setTokenBAmount('');
    } catch (error) {
      console.error("Error providing liquidity:", error);
      setAnimationState('error');
    } finally {
      fetchBalancesAndReserves();
    }
  };

  // Stake tab: deposit LP tokens from wallet.
  const handleStakeLpTokens = async () => {
    if (!isKeplrConnected) return;
    const inputAmount = toMicroUnits(lpTokenAmount, tokenB.lp);
    const snipMsg = { deposit: {} };
    try {
      setIsModalOpen(true);
      setAnimationState('loading');
      await snip(
        tokenB.lp.contract,
        tokenB.lp.hash,
        stakingContract,
        stakingHash,
        snipMsg,
        inputAmount
      );
      console.log("LP tokens staked successfully!");
      setAnimationState('success');
      setLpTokenAmount('');
    } catch (error) {
      console.error("Error staking LP tokens:", error);
      setAnimationState('error');
    } finally {
      fetchBalancesAndReserves();
    }
  };

  // Stake tab: withdraw staked LP tokens.
  // If unstakeUnbond is true, then create an unbonding request; if false, immediate withdrawal.
  const handleUnstakeLpTokens = async () => {
    if (!isKeplrConnected) return;
    const inputAmount = toMicroUnits(unstakeAmount, tokenB.lp);
    const contractMsg = { withdraw: { pool: tokenB.poolContract, amount: inputAmount.toString(), unbond: unstakeUnbond } };
    try {
      setIsModalOpen(true);
      setAnimationState('loading');
      await contract(stakingContract, stakingHash, contractMsg);
      console.log("Unstake request sent successfully!");
      setAnimationState('success');
      setUnstakeAmount('');
    } catch (error) {
      console.error("Error unstaking LP tokens:", error);
      setAnimationState('error');
    } finally {
      fetchBalancesAndReserves();
      fetchUnbondingRequests();
    }
  };

  // Unbond tab: create an unbonding request using wallet LP tokens.
  const handleCreateUnbondRequest = async () => {
    if (!isKeplrConnected) return;
    const inputAmount = toMicroUnits(unbondAmount, tokenB.lp);
    const snipMsg = {
      withdraw_liquidity: {
        pool: tokenB.poolContract,
        amount: inputAmount.toString(),
        unbond: true
      }
    };
    try {
      setIsModalOpen(true);
      setAnimationState('loading');
      await snip(
        tokenB.lp.contract,
        tokenB.lp.hash,
        tokenB.poolContract,
        tokenB.poolHash,
        snipMsg,
        inputAmount
      );
      console.log("Unbond request created successfully!");
      setAnimationState('success');
      setUnbondAmount('');
    } catch (error) {
      console.error("Error creating unbond request:", error);
      setAnimationState('error');
    } finally {
      fetchBalancesAndReserves();
      fetchUnbondingRequests();
    }
  };

  // Unbond tab: complete (claim) unbonding requests.
  const handleCompleteUnbond = async () => {
    if (!isKeplrConnected) return;
    try {
      setIsModalOpen(true);
      setAnimationState('loading');
      const msg = { claim_unbond_liquidity: { pool: tokenB.poolContract } };
      await contract(stakingContract, stakingHash, msg);
      console.log("Unbond claim successful!");
      setAnimationState('success');
    } catch (error) {
      console.error("Error completing unbond:", error);
      setAnimationState('error');
    } finally {
      fetchBalancesAndReserves();
      fetchUnbondingRequests();
    }
  };

  return (
    <div className="liquidity-management-box">
      <StatusModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        animationState={animationState} 
      />
      <h2>Manage Liquidity (migration soon – DO NOT USE!)</h2>
      <div className="liquidity-management-close-button" onClick={toggleManageLiquidity}>X</div>
      
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
      
      {/* Provide Tab */}
      {activeTab === 'Provide' && (
        <div id="Provide" className="liquidity-management-tabcontent">
          <div className="liquidity-management-input-group">
            <div className="liquidity-management-label-wrapper">
              <label htmlFor="provide-tokenB" className="liquidity-management-input-label">{tokenBKey}</label>
              <div className="balance-container">
                {tokenBBalance === 'Error' ? (
                  <button className="max-button" onClick={() => handleRequestViewingKey(tokenB)}>
                    Get Viewing Key
                  </button>
                ) : (
                  <>
                    Balance: {tokenBBalance !== null ? tokenBBalance : 'N/A'}
                    <button className="max-button" onClick={handleMaxTokenBAmount}>Max</button>
                  </>
                )}
              </div>
            </div>
            <div className="liquidity-management-input-wrapper">
              <img id="provide-tokenB-logo" src={tokenB.logo} alt={`${tokenBKey} Token`} className="liquidity-management-input-logo" />
              <input 
                type="text" 
                id="provide-tokenB" 
                value={tokenBAmount} 
                onChange={handleTokenBChange}
                placeholder={`Amount of ${tokenBKey} to Provide`} 
                className="liquidity-management-input" 
              />
            </div>
          </div>
          <div className="liquidity-management-input-group">
            <div className="liquidity-management-label-wrapper">
              <label htmlFor="provide-erth" className="liquidity-management-input-label">ERTH</label>
              <div className="balance-container">
                {erthBalance === 'Error' ? (
                  <button className="max-button" onClick={() => handleRequestViewingKey(tokenErth)}>
                    Get Viewing Key
                  </button>
                ) : (
                  <>
                    Balance: {erthBalance !== null ? erthBalance : 'N/A'}
                    <button className="max-button" onClick={handleMaxErthAmount}>Max</button>
                  </>
                )}
              </div>
            </div>
            <div className="liquidity-management-input-wrapper">
              <img id="provide-erth-logo" src={tokenErth.logo} alt="ERTH Token" className="liquidity-management-input-logo" />
              <input 
                type="text" 
                id="provide-erth" 
                value={erthAmount} 
                onChange={handleErthChange}
                placeholder="Amount of ERTH to Provide" 
                className="liquidity-management-input" 
              />
            </div>
          </div>
          <div className="toggle-switch-container">
            <label className="switch">
              <input type="checkbox" checked={provideStake} onChange={() => setProvideStake(!provideStake)} />
              <span className="slider-toggle"></span>
            </label>
            <span className="toggle-label">{provideStake ? 'Stake LP Tokens' : 'Create LP Tokens'}</span>
          </div>
          <button onClick={handleProvideLiquidity} className="liquidity-management-button">
            Provide Liquidity
          </button>
        </div>
      )}
      
      {/* Stake Tab */}
      {activeTab === 'Stake' && (
        <div id="Stake" className="liquidity-management-tabcontent">
          {/* Stake Section */}
          <div className="liquidity-management-input-group">
            <div className="liquidity-management-label-wrapper">
              <label htmlFor="stake-lp" className="liquidity-management-input-label">Deposit LP Tokens</label>
              <div className="balance-container">
                {lpTokenWalletBalance === 'Error' ? (
                  <button className="max-button" onClick={() => handleRequestViewingKey(tokenB.lp)}>
                    Get Viewing Key
                  </button>
                ) : (
                  <>
                    Balance: {lpTokenWalletBalance !== null ? lpTokenWalletBalance : 'N/A'}
                    <button className="max-button" onClick={handleMaxLpTokenWalletBalance}>Max</button>
                  </>
                )}
              </div>
            </div>
            <div className="liquidity-management-input-wrapper">
              <input 
                type="text" 
                id="stake-lp" 
                value={lpTokenAmount} 
                onChange={(e) => setLpTokenAmount(e.target.value)} 
                placeholder="Amount of LP Tokens to Stake" 
                className="liquidity-management-input" 
              />
            </div>
          </div>
          <button onClick={handleStakeLpTokens} className="liquidity-management-button">
            Stake LP
          </button>
          {/* Unstake Section */}
          <div className="liquidity-management-input-group">
            <div className="liquidity-management-label-wrapper">
              <label htmlFor="unstake-lp" className="liquidity-management-input-label">Withdraw Staked LP</label>
              <div className="balance-container">
                {stakedLpTokenBalance === 'Error' ? (
                  <button className="max-button" onClick={() => handleRequestViewingKey(stakingContract)}>
                    Get Viewing Key
                  </button>
                ) : (
                  <>
                    Balance: {stakedLpTokenBalance !== null ? stakedLpTokenBalance : 'N/A'}
                    <button className="max-button" onClick={handleMaxStakedLpTokenBalance}>Max</button>
                  </>
                )}
              </div>
            </div>
            <div className="liquidity-management-input-wrapper">
              <input 
                type="text" 
                id="unstake-lp" 
                value={unstakeAmount} 
                onChange={(e) => setUnstakeAmount(e.target.value)} 
                placeholder="Amount of LP Tokens to Withdraw" 
                className="liquidity-management-input" 
              />
            </div>
          </div>
          <div className="toggle-switch-container">
            <label className="switch">
              <input type="checkbox" checked={unstakeUnbond} onChange={() => setUnstakeUnbond(!unstakeUnbond)} />
              <span className="slider-toggle"></span>
            </label>
            <span className="toggle-label">
              {unstakeUnbond ? 'Create Unbond Request' : 'Withdraw LP Tokens'}
            </span>
          </div>
          <button onClick={handleUnstakeLpTokens} className="liquidity-management-button">
            Withdraw Staked LP
          </button>
        </div>
      )}
      
      {/* Unbond Tab */}
      {activeTab === 'Unbond' && (
        <div id="Unbond" className="liquidity-management-tabcontent">
          <div className="liquidity-management-input-group">
            <div className="liquidity-management-label-wrapper">
              <label htmlFor="unbond-lp" className="liquidity-management-input-label">Wallet LP Tokens</label>
              <div className="balance-container">
                {lpTokenWalletBalance === 'Error' ? (
                  <button className="max-button" onClick={() => handleRequestViewingKey(tokenB.lp)}>
                    Get Viewing Key
                  </button>
                ) : (
                  <>
                    Balance: {lpTokenWalletBalance !== null ? lpTokenWalletBalance : 'N/A'}
                    <button className="max-button" onClick={handleMaxUnbondAmount}>Max</button>
                  </>
                )}
              </div>
            </div>
            <div className="liquidity-management-input-wrapper">
              <input 
                type="text" 
                id="unbond-lp" 
                value={unbondAmount} 
                onChange={(e) => setUnbondAmount(e.target.value)} 
                placeholder="Amount of LP Tokens to Unbond" 
                className="liquidity-management-input" 
              />
            </div>
          </div>
          <button onClick={handleCreateUnbondRequest} className="liquidity-management-button">
            Create Unbond Request
          </button>
          <button onClick={handleCompleteUnbond} className="liquidity-management-button" style={{ marginTop: '10px' }}>
            Complete Unbond
          </button>
          {unbondingRequests.length > 0 && (
            <div className="unbonding-requests">
              <h3>Unbonding Requests</h3>
              <ul>
                {unbondingRequests.map((req, index) => (
                  <li key={index}>
                    Amount: {toMacroUnits(req.amount, tokenB.lp)} LP, Claimable at: {new Date(req.claimable_at * 1000).toLocaleString()}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default LiquidityManagement;
