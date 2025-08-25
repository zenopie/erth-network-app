import React, { useState, useEffect, useCallback } from "react";
import { querySnipBalance, queryNativeBalance, wrapScrt, unwrapSscrt, requestViewingKey } from "../utils/contractUtils";
import tokens from "../utils/tokens"; // e.g. { sSCRT: { contract, hash, decimals, logo }, SCRT: { decimals, logo } }
import { showLoadingScreen } from "../utils/uiUtils";
import { toMicroUnits } from "../utils/mathUtils";
import StatusModal from "../components/StatusModal";
import "./GasStation.css";

const GasStation = ({ isKeplrConnected }) => {
  // 'wrap' => SCRT to sSCRT | 'unwrap' => sSCRT to SCRT
  const [mode, setMode] = useState("unwrap");
  const [amount, setAmount] = useState("");
  const [scrtBalance, setScrtBalance] = useState(null);
  const [sscrtBalance, setSscrtBalance] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");

  // Define which token is "from" and "to" based on the current mode
  const fromToken = mode === "wrap" ? "SCRT" : "sSCRT";
  const toToken = mode === "wrap" ? "sSCRT" : "SCRT";
  const fromBalance = mode === "wrap" ? scrtBalance : sscrtBalance;
  const toBalance = mode === "wrap" ? sscrtBalance : scrtBalance;

  // ========== FETCH USER BALANCES ==========
  const fetchData = useCallback(async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr not connected");
      return;
    }
    showLoadingScreen(true);
    try {
      const [nativeBal, snipBal] = await Promise.all([queryNativeBalance(), querySnipBalance(tokens.sSCRT)]);

      setScrtBalance(isNaN(nativeBal) ? "Error" : parseFloat(nativeBal));
      setSscrtBalance(isNaN(snipBal) ? "Error" : parseFloat(snipBal));
    } catch (err) {
      console.error("[fetchData] error:", err);
      setScrtBalance("Error");
      setSscrtBalance("Error");
    } finally {
      showLoadingScreen(false);
    }
  }, [isKeplrConnected]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // ========== Handle Amount Change ==========
  const handleAmountChange = (val) => {
    // Prevent negative numbers
    const sanitizedValue = val.startsWith("-") ? "" : val;
    setAmount(sanitizedValue);
  };

  // ========== Handle Mode Toggle ==========
  const handleModeToggle = () => {
    setMode(currentMode => (currentMode === "wrap" ? "unwrap" : "wrap"));
    setAmount(""); // Reset amount on toggle
  };

  // ========== WRAP/UNWRAP BUTTON ==========
  const handleAction = async () => {
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

      if (mode === "wrap") {
        await wrapScrt(amountInMicro.toString());
      } else {
        await unwrapSscrt(amountInMicro.toString());
      }

      setAnimationState("success");
      setAmount("");
    } catch (err) {
      console.error(`[handleAction: ${mode}] error:`, err);
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
    await requestViewingKey(tokens.sSCRT);
    fetchData();
  };

  if (!isKeplrConnected) {
    return <div className="gas-error-message">Connect Keplr first</div>;
  }

  if (!tokens[fromToken] || !tokens[toToken]) {
    return <div>Loading...</div>;
  }

  return (
    <div className="gas-box">
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />

      <div className="gas-title-container">
        <h2 className="gas-title">Gas Station</h2>
      </div>

      {/* FROM INPUT */}
      <div className="gas-input-group">
        <div className="gas-label-wrapper">
          <label className="gas-input-label">From</label>
          <div className="gas-token-balance">
            {fromBalance === "Error" && fromToken === "sSCRT" ? (
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
          {fromToken === "SCRT" ? (
            <i className="bx bxs-gas-pump gas-input-logo" aria-hidden="true"></i>
          ) : (
            <img src={tokens[fromToken].logo} alt={`${fromToken} logo`} className="gas-input-logo" />
          )}
          <div className="gas-token-name">{fromToken}</div>
          <input
            type="number"
            className="gas-token-input"
            placeholder="0.0"
            value={amount}
            onChange={(e) => handleAmountChange(e.target.value)}
          />
        </div>
      </div>

      {/* Toggle Button */}
      <div className="gas-toggle-container">
        <button className="gas-toggle-button" onClick={handleModeToggle} aria-label="Toggle wrap/unwrap">
          <i className="bx bx-refresh" aria-hidden="true"></i>
        </button>
      </div>

      {/* TO INPUT (read-only) */}
      <div className="gas-input-group">
        <div className="gas-label-wrapper">
          <label className="gas-input-label">To</label>
          <div className="gas-token-balance">
            {toBalance === "Error" && toToken === "sSCRT" ? (
              <button className="gas-vk-button" onClick={handleRequestViewingKey}>
                Get Viewing Key
              </button>
            ) : (
              <>Balance: {toBalance ?? "..."}</>
            )}
          </div>
        </div>

        <div className="gas-input-wrapper">
          {toToken === "SCRT" ? (
            <i className="bx bxs-gas-pump gas-input-logo" aria-hidden="true"></i>
          ) : (
            <img src={tokens[toToken].logo} alt={`${toToken} logo`} className="gas-input-logo" />
          )}
          <div className="gas-token-name">{toToken}</div>
          <input
            type="number"
            className="gas-token-input"
            placeholder="0.0"
            value={amount}
            disabled
            readOnly
          />
        </div>
      </div>

      {/* Action Button */}
      <button className="gas-button" onClick={handleAction} disabled={!amount || parseFloat(amount) <= 0}>
        {mode === "wrap" ? "Wrap" : "Unwrap"}
      </button>
    </div>
  );
};

export default GasStation;