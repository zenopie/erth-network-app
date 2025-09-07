import React, { useState, useEffect, useCallback } from "react";
import { querySnipBalance, queryNativeBalance, requestViewingKey, snip, query } from "../utils/contractUtils";
import tokens from "../utils/tokens";
import contracts from "../utils/contracts";
import { showLoadingScreen } from "../utils/uiUtils";
import { toMicroUnits } from "../utils/mathUtils";
import StatusModal from "../components/StatusModal";
import "./GasStation.css";

const GasStation = ({ isKeplrConnected }) => {
  const [fromToken, setFromToken] = useState("sSCRT");
  const [amount, setAmount] = useState("");
  const [expectedScrt, setExpectedScrt] = useState("");
  const [fromBalance, setFromBalance] = useState(null);
  const [scrtBalance, setScrtBalance] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  const [hasGasGrant, setHasGasGrant] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [canClaimFaucet, setCanClaimFaucet] = useState(false);

  // ========== FETCH USER BALANCES ==========
  const fetchData = useCallback(async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr not connected");
      return;
    }
    showLoadingScreen(true);
    try {
      const [nativeBal, tokenBal] = await Promise.all([
        queryNativeBalance(), 
        querySnipBalance(tokens[fromToken])
      ]);

      setScrtBalance(isNaN(nativeBal) ? "Error" : parseFloat(nativeBal));
      setFromBalance(isNaN(tokenBal) ? "Error" : parseFloat(tokenBal));
    } catch (err) {
      console.error("[fetchData] error:", err);
      setScrtBalance("Error");
      setFromBalance("Error");
    } finally {
      showLoadingScreen(false);
    }
  }, [isKeplrConnected, fromToken]);

  useEffect(() => {
    fetchData();
    if (isKeplrConnected) {
      checkRegistrationStatus();
    }
  }, [fetchData, isKeplrConnected]);

  // ========== CHECK REGISTRATION STATUS ==========
  const checkRegistrationStatus = async () => {
    if (!window.secretjs || !window.secretjs.address) return;
    
    try {
      const querymsg = {
        query_registration_status: {
          address: window.secretjs.address,
        },
      };

      const result = await query(contracts.registration.contract, contracts.registration.hash, querymsg);
      
      if (result.registration_status === true) {
        setIsRegistered(true);
        // Check if they can claim faucet (once per week)
        const now = Date.now();
        const oneWeekInMillis = 7 * 24 * 60 * 60 * 1000;
        const nextClaim = result.last_claim / 1000000 + oneWeekInMillis;
        setCanClaimFaucet(now > nextClaim);
      } else {
        setIsRegistered(false);
        setCanClaimFaucet(false);
      }
    } catch (err) {
      console.error("[checkRegistrationStatus] error:", err);
      setIsRegistered(false);
      setCanClaimFaucet(false);
    }
  };

  // ========== Handle Amount Change ==========
  const handleAmountChange = async (val) => {
    // Prevent negative numbers
    const sanitizedValue = val.startsWith("-") ? "" : val;
    setAmount(sanitizedValue);
    
    // Simulate expected SCRT output if input amount is valid
    if (!sanitizedValue || isNaN(sanitizedValue) || parseFloat(sanitizedValue) <= 0) {
      setExpectedScrt("");
      return;
    }
    
    try {
      const amountInMicro = toMicroUnits(parseFloat(sanitizedValue), tokens[fromToken]);
      
      // Always simulate swap to sSCRT to get accurate output (accounts for fees)
      const simulateMsg = {
        simulate_swap: {
          input_token: tokens[fromToken].contract,
          amount: amountInMicro.toString(),
          output_token: tokens.sSCRT.contract,
        },
      };
      
      const result = await query(contracts.exchange.contract, contracts.exchange.hash, simulateMsg);
      const sscrtOutputMicro = result.output_amount;
      
      // The final SCRT amount will be the same as sSCRT amount (1:1 unwrap)
      const scrtOutputMacro = parseFloat(sscrtOutputMicro) / 10 ** tokens.sSCRT.decimals;
      setExpectedScrt(scrtOutputMacro.toFixed(6));
    } catch (err) {
      console.error("[simulate swap] error:", err);
      setExpectedScrt("");
    }
  };

  // ========== Handle Token Change ==========
  const handleTokenChange = (e) => {
    setFromToken(e.target.value);
    setAmount("");
    setExpectedScrt("");
  };

  // ========== SWAP FOR GAS BUTTON ==========
  const handleSwapForGas = async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr not connected.");
      return;
    }
    const inputAmount = parseFloat(amount);
    if (isNaN(inputAmount) || inputAmount <= 0) {
      console.warn("Invalid input amount");
      return;
    }

    setIsModalOpen(true);
    setAnimationState("loading");
    
    try {
      const amountInMicro = toMicroUnits(inputAmount, tokens[fromToken]);
      
      // Use the swap_for_gas message
      const swapForGasMsg = {
        swap_for_gas: {
          from: window.secretjs.address,
          amount: amountInMicro.toString(),
        },
      };
      
      await snip(
        tokens[fromToken].contract,
        tokens[fromToken].hash,
        contracts.exchange.contract,
        contracts.exchange.hash,
        swapForGasMsg,
        amountInMicro
      );
    
      setAnimationState("success");
      setAmount("");
      setExpectedScrt("");
    } catch (err) {
      console.error("[handleSwapForGas] error:", err);
      setAnimationState("error");
    } finally {
      // Refresh balances after the transaction
      fetchData();
    }
  };

  // ========== HELPER FUNCTIONS ==========
  const handleMaxAmount = () => {
    if (typeof fromBalance === "number") {
      handleAmountChange(fromBalance.toString());
    }
  };

  const handleRequestViewingKey = async () => {
    await requestViewingKey(tokens[fromToken]);
    fetchData();
  };

  // ========== FAUCET HANDLER ==========
  const handleFaucet = async () => {
    if (!isKeplrConnected || !window.secretjs || !isRegistered || !canClaimFaucet) {
      console.warn("Cannot claim faucet");
      return;
    }

    setIsModalOpen(true);
    setAnimationState("loading");

    try {
      // TODO: Replace with actual backend endpoint
      const response = await fetch('/api/faucet-gas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: window.secretjs.address,
        }),
      });

      const result = await response.json();
      
      if (result.success) {
        setCanClaimFaucet(false);
        setAnimationState("success");
        // Refresh balances
        fetchData();
      } else {
        setAnimationState("error");
      }
    } catch (err) {
      console.error("[handleFaucet] error:", err);
      setAnimationState("error");
    }
  };

  if (!isKeplrConnected) {
    return <div className="gas-error-message">Connect Keplr first</div>;
  }

  if (!tokens[fromToken]) {
    return <div>Loading...</div>;
  }

  // Get available tokens (exclude SCRT since we're converting TO SCRT)
  const availableTokens = Object.keys(tokens);

  return (
    <div className="gas-box">
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />

      <div className="gas-title-container">
        <h2 className="gas-title">Gas Station</h2>
        <p className="gas-subtitle">Swap any token for SCRT (gas)</p>
      </div>

      {/* FROM INPUT */}
      <div className="gas-input-group">
        <div className="gas-label-wrapper">
          <label className="gas-input-label">From</label>
          <div className="gas-token-balance">
            {fromBalance === "Error" ? (
              <button className="gas-vk-button" onClick={handleRequestViewingKey}>
                Get Viewing Key
              </button>
            ) : (
              <>
                Balance: {fromBalance ?? "..."}
                <button className="gas-max-button" onClick={handleMaxAmount}>
                  Max
                </button>
              </>
            )}
          </div>
        </div>

        <div className="gas-input-wrapper">
          <img src={tokens[fromToken].logo} alt={`${fromToken} logo`} className="gas-input-logo" />
          <select className="gas-token-select" value={fromToken} onChange={handleTokenChange}>
            {availableTokens.map((tk) => (
              <option key={tk} value={tk}>
                {tk}
              </option>
            ))}
          </select>
          <input
            type="number"
            className="gas-token-input"
            placeholder="0.0"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
          />
        </div>
      </div>

      {/* Arrow Down */}
      <div className="gas-arrow-container">
        <i className="bx bx-down-arrow-alt gas-arrow" aria-hidden="true"></i>
      </div>

      {/* TO INPUT (read-only) */}
      <div className="gas-input-group">
        <div className="gas-label-wrapper">
          <label className="gas-input-label">To (Gas)</label>
          <div className="gas-token-balance">
            Balance: {scrtBalance ?? "..."}
          </div>
        </div>

        <div className="gas-input-wrapper">
          <i className="bx bxs-gas-pump gas-input-logo" aria-hidden="true"></i>
          <div className="gas-token-name">SCRT</div>
          <input
            type="number"
            className="gas-token-input"
            placeholder="0.0"
            value={expectedScrt}
            disabled
            readOnly
          />
        </div>
      </div>

      {/* Faucet Button */}
      <div className="gas-faucet-container">
        <button 
          className={`gas-faucet-button ${!isRegistered || !canClaimFaucet ? 'disabled' : ''}`}
          onClick={handleFaucet} 
          disabled={!isRegistered || !canClaimFaucet}
        >
          Faucet
        </button>
        <span className="gas-faucet-info">
          ?
          <div className="gas-faucet-tooltip">
            <div className="tooltip-text">Registered users can get a free swap to gas once a week</div>
            <div className="tooltip-checklist">
              <div className={`checklist-item ${isRegistered ? 'checked' : ''}`}>
                <span className="checkmark">{isRegistered ? '✓' : '✗'}</span>
                Registered
              </div>
              <div className={`checklist-item ${canClaimFaucet ? 'checked' : ''}`}>
                <span className="checkmark">{canClaimFaucet ? '✓' : '✗'}</span>
                Available to use
              </div>
            </div>
          </div>
        </span>
      </div>

      {/* Action Button */}
      <button className="gas-button" onClick={handleSwapForGas} disabled={!amount || parseFloat(amount) <= 0 || !expectedScrt}>
        Swap for Gas
      </button>
    </div>
  );
};

export default GasStation;