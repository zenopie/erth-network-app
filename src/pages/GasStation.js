import React, { useState, useEffect, useCallback } from "react";
import { querySnipBalance, queryNativeBalance, requestViewingKey, snip, query } from "../utils/contractUtils";
import tokens from "../utils/tokens";
import contracts from "../utils/contracts";
import { showLoadingScreen } from "../utils/uiUtils";
import { toMicroUnits } from "../utils/mathUtils";
import { ERTH_API_BASE_URL } from "../utils/config";
import StatusModal from "../components/StatusModal";
import styles from "./GasStation.module.css";

const GasStation = ({ isKeplrConnected }) => {
  const [activeTab, setActiveTab] = useState("SwapForGas");
  const [fromToken, setFromToken] = useState("SSCRT");
  const [amount, setAmount] = useState("");
  const [expectedScrt, setExpectedScrt] = useState("");
  const [fromBalance, setFromBalance] = useState(null);
  const [scrtBalance, setScrtBalance] = useState(null);

  // Wrap/Unwrap specific states
  const [wrapUnwrapAmount, setWrapUnwrapAmount] = useState("");
  const [isWrapMode, setIsWrapMode] = useState(true); // true = wrap SCRT->SSCRT, false = unwrap SSCRT->SCRT
  const [sscrtBalance, setSscrtBalance] = useState(null);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");
  const [hasGasGrant, setHasGasGrant] = useState(false);
  const [isRegistered, setIsRegistered] = useState(false);
  const [canClaimFaucet, setCanClaimFaucet] = useState(false);

  // Fee granter address from backend
  const FEE_GRANTER_ADDRESS = "secret1ktpxcznqcls64t8tjyv3atwhndscgw08yp2jas";

  // ========== FETCH USER BALANCES ==========
  const fetchData = useCallback(async () => {
    if (!isKeplrConnected) {
      console.warn("Keplr not connected");
      return;
    }
    showLoadingScreen(true);
    try {
      const [nativeBal, tokenBal, sscrtBal] = await Promise.all([
        queryNativeBalance(),
        querySnipBalance(tokens[fromToken]),
        querySnipBalance(tokens.SSCRT)
      ]);

      setScrtBalance(isNaN(nativeBal) ? "Error" : parseFloat(nativeBal));
      setFromBalance(isNaN(tokenBal) ? "Error" : parseFloat(tokenBal));
      setSscrtBalance(isNaN(sscrtBal) ? "Error" : parseFloat(sscrtBal));
    } catch (err) {
      console.error("[fetchData] error:", err);
      setScrtBalance("Error");
      setFromBalance("Error");
      setSscrtBalance("Error");
    } finally {
      showLoadingScreen(false);
    }
  }, [isKeplrConnected, fromToken]);

  useEffect(() => {
    fetchData();
    if (isKeplrConnected) {
      checkFaucetEligibility();
    }
  }, [fetchData, isKeplrConnected]);

  // ========== CHECK FAUCET ELIGIBILITY ==========
  const checkFaucetEligibility = async () => {
    if (!window.secretjs || !window.secretjs.address) return;

    try {
      const response = await fetch(`${ERTH_API_BASE_URL}/faucet-eligibility/${window.secretjs.address}`);
      const result = await response.json();

      if (response.ok) {
        setIsRegistered(result.registered);
        setCanClaimFaucet(result.eligible);
      } else {
        console.error("[checkFaucetEligibility] API error:", result);
        setIsRegistered(false);
        setCanClaimFaucet(false);
      }
    } catch (err) {
      console.error("[checkFaucetEligibility] error:", err);
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

      if (fromToken === "SSCRT") {
        // For SSCRT unwrap, it's 1:1 conversion to SCRT
        const scrtOutputMacro = parseFloat(sanitizedValue);
        setExpectedScrt(scrtOutputMacro.toFixed(6));
      } else {
        // Simulate swap to SSCRT first, then account for 1:1 unwrap to SCRT
        const simulateMsg = {
          simulate_swap: {
            input_token: tokens[fromToken].contract,
            amount: amountInMicro.toString(),
            output_token: tokens.SSCRT.contract,
          },
        };

        const result = await query(contracts.exchange.contract, contracts.exchange.hash, simulateMsg);
        const sscrtOutputMicro = result.output_amount;

        // The final SCRT amount will be the same as SSCRT amount (1:1 unwrap)
        const scrtOutputMacro = parseFloat(sscrtOutputMicro) / 10 ** tokens.SSCRT.decimals;
        setExpectedScrt(scrtOutputMacro.toFixed(6));
      }
    } catch (err) {
      console.error("[simulate] error:", err);
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

      if (fromToken === "SSCRT") {
        // Use unwrap for SSCRT -> SCRT (direct contract call, not token send)
        const { MsgExecuteContract } = await import('secretjs');

        const unwrapMsg = {
          redeem: {
            amount: amountInMicro.toString(),
          },
        };

        const msg = new MsgExecuteContract({
          sender: window.secretjs.address,
          contract_address: tokens.SSCRT.contract,
          code_hash: tokens.SSCRT.hash,
          msg: unwrapMsg
        });

        if (hasGasGrant) {
          // Use fee granter for gasless transaction
          const resp = await window.secretjs.tx.broadcast([msg], {
            gasLimit: 150_000,
            gasPriceInFeeDenom: 0.25,
            feeDenom: 'uscrt',
            feeGranter: FEE_GRANTER_ADDRESS
          });

          if (resp.code !== 0) {
            throw new Error(`Transaction failed: ${resp.rawLog}`);
          }
        } else {
          // Regular transaction
          const resp = await window.secretjs.tx.broadcast([msg], {
            gasLimit: 150_000,
            gasPriceInFeeDenom: 0.25,
            feeDenom: 'uscrt'
          });

          if (resp.code !== 0) {
            throw new Error(`Transaction failed: ${resp.rawLog}`);
          }
        }
      } else {
        // Use the swap_for_gas message for other tokens
        const swapForGasMsg = {
          swap_for_gas: {
            from: window.secretjs.address,
            amount: amountInMicro.toString(),
          },
        };

        if (hasGasGrant) {
          // Use fee granter for gasless transaction
          await snipWithFeeGrant(
            tokens[fromToken].contract,
            tokens[fromToken].hash,
            contracts.exchange.contract,
            contracts.exchange.hash,
            swapForGasMsg,
            amountInMicro
          );
        } else {
          // Regular transaction
          await snip(
            tokens[fromToken].contract,
            tokens[fromToken].hash,
            contracts.exchange.contract,
            contracts.exchange.hash,
            swapForGasMsg,
            amountInMicro
          );
        }
      }
    
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

  // ========== SNIP WITH FEE GRANT ==========
  const snipWithFeeGrant = async (tokenContract, tokenHash, recipientContract, recipientHash, message, amount) => {
    if (!window.secretjs) {
      throw new Error("SecretJS not initialized");
    }

    const { MsgExecuteContract } = await import('secretjs');
    
    const hookmsg64 = btoa(JSON.stringify(message));
    const msg = new MsgExecuteContract({
      sender: window.secretjs.address,
      contract_address: tokenContract,
      code_hash: tokenHash,
      msg: {
        send: {
          recipient: recipientContract,
          code_hash: recipientHash,
          amount: amount.toString(),
          msg: hookmsg64,
        }
      }
    });

    // Broadcast with fee grant
    const resp = await window.secretjs.tx.broadcast([msg], {
      gasLimit: 500_000,
      gasPriceInFeeDenom: 0.25,
      feeDenom: 'uscrt',
      feeGranter: FEE_GRANTER_ADDRESS
    });

    if (resp.code !== 0) {
      throw new Error(`Transaction failed: ${resp.rawLog}`);
    }

    console.log("Snip with fee grant:", resp);
    return resp;
  };

  // ========== FAUCET HANDLER ==========
  const handleFaucet = async () => {
    if (!isKeplrConnected || !window.secretjs) {
      console.warn("Wallet not connected");
      return;
    }

    setIsModalOpen(true);
    setAnimationState("loading");

    try {
      const response = await fetch(`${ERTH_API_BASE_URL}/faucet-gas`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          address: window.secretjs.address,
        }),
      });

      const result = await response.json();
      
      if (response.ok && result.success) {
        setCanClaimFaucet(false);
        setHasGasGrant(true);
        setAnimationState("success");
        console.log("Gas allowance granted:", result);
        // Refresh balances and faucet eligibility
        fetchData();
        checkFaucetEligibility();
      } else {
        console.error("Faucet error:", result);
        setAnimationState("error");
      }
    } catch (err) {
      console.error("[handleFaucet] error:", err);
      setAnimationState("error");
    }
  };

  // Handle wrap/unwrap based on current mode
  const handleWrapUnwrap = async () => {
    if (!isKeplrConnected || !wrapUnwrapAmount || parseFloat(wrapUnwrapAmount) <= 0) return;

    setIsModalOpen(true);
    setAnimationState("loading");

    try {
      if (isWrapMode) {
        // Wrap SCRT to SSCRT
        const { MsgExecuteContract } = await import('secretjs');
        const amountInMicro = toMicroUnits(parseFloat(wrapUnwrapAmount), { decimals: 6 });

        const msg = new MsgExecuteContract({
          sender: window.secretjs.address,
          contract_address: tokens.SSCRT.contract,
          code_hash: tokens.SSCRT.hash,
          msg: { deposit: {} },
          sent_funds: [{ denom: "uscrt", amount: amountInMicro.toString() }]
        });

        const resp = await window.secretjs.tx.broadcast([msg], {
          gasLimit: 150_000,
          gasPriceInFeeDenom: 0.25,
          feeDenom: 'uscrt'
        });

        if (resp.code !== 0) {
          throw new Error(`Transaction failed: ${resp.rawLog}`);
        }
      } else {
        // Unwrap SSCRT to SCRT (direct contract call, not token send)
        const { MsgExecuteContract } = await import('secretjs');
        const amountInMicro = toMicroUnits(parseFloat(wrapUnwrapAmount), tokens.SSCRT);

        const unwrapMsg = {
          redeem: {
            amount: amountInMicro.toString(),
          },
        };

        const msg = new MsgExecuteContract({
          sender: window.secretjs.address,
          contract_address: tokens.SSCRT.contract,
          code_hash: tokens.SSCRT.hash,
          msg: unwrapMsg
        });

        const resp = await window.secretjs.tx.broadcast([msg], {
          gasLimit: 150_000,
          gasPriceInFeeDenom: 0.25,
          feeDenom: 'uscrt'
        });

        if (resp.code !== 0) {
          throw new Error(`Transaction failed: ${resp.rawLog}`);
        }
      }

      setAnimationState("success");
      setWrapUnwrapAmount("");
    } catch (err) {
      console.error(`[handle${isWrapMode ? 'Wrap' : 'Unwrap'}] error:`, err);
      setAnimationState("error");
    } finally {
      fetchData();
    }
  };

  // Toggle between wrap and unwrap modes
  const toggleWrapUnwrapMode = () => {
    setIsWrapMode(!isWrapMode);
    setWrapUnwrapAmount(""); // Clear amount when switching modes
  };

  // Request viewing key for SSCRT
  const handleRequestSscrtViewingKey = async () => {
    await requestViewingKey(tokens.SSCRT);
    fetchData();
  };

  if (!isKeplrConnected) {
    return <div className={styles.gasErrorMessage}>Connect Keplr first</div>;
  }

  if (!tokens[fromToken]) {
    return <div>Loading...</div>;
  }

  // Get available tokens (exclude SCRT since we're converting TO SCRT)
  const availableTokens = Object.keys(tokens);

  // Render tab content based on active tab
  const renderTabContent = () => {
    switch (activeTab) {
      case "SwapForGas":
        return (
          <div className={`${styles.gasTabcontent} ${styles.active}`}>
            {/* FROM INPUT */}
            <div className={styles.gasInputGroup}>
              <div className={styles.gasLabelWrapper}>
                <label className={styles.gasInputLabel}>From</label>
                <div className={styles.gasTokenBalance}>
                  {fromBalance === "Error" ? (
                    <button className={styles.gasVkButton} onClick={handleRequestViewingKey}>
                      Get Viewing Key
                    </button>
                  ) : (
                    <>
                      Balance: {fromBalance ?? "..."}
                      <button className={styles.gasMaxButton} onClick={handleMaxAmount}>
                        Max
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className={styles.gasInputWrapper}>
                <img src={tokens[fromToken].logo} alt={`${fromToken} logo`} className={styles.gasInputLogo} />
                <select className={styles.gasTokenSelect} value={fromToken} onChange={handleTokenChange}>
                  {availableTokens.map((tk) => (
                    <option key={tk} value={tk}>
                      {tk}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  className={styles.gasTokenInput}
                  placeholder="0.0"
                  value={amount}
                  onChange={(e) => handleAmountChange(e.target.value)}
                />
              </div>
            </div>

            {/* Arrow Down */}
            <div className={styles.gasArrowContainer}>
              <i className={`bx bx-down-arrow-alt ${styles.gasArrow}`} aria-hidden="true"></i>
            </div>

            {/* TO INPUT (read-only) */}
            <div className={styles.gasInputGroup}>
              <div className={styles.gasLabelWrapper}>
                <label className={styles.gasInputLabel}>To (Gas)</label>
                <div className={styles.gasTokenBalance}>
                  Balance: {scrtBalance ?? "..."}
                </div>
              </div>

              <div className={styles.gasInputWrapper}>
                <i className={`bx bxs-gas-pump ${styles.gasInputLogo}`} aria-hidden="true"></i>
                <div className={styles.gasTokenName}>SCRT</div>
                <input
                  type="number"
                  className={styles.gasTokenInput}
                  placeholder="0.0"
                  value={expectedScrt}
                  disabled
                  readOnly
                />
              </div>
            </div>

            {/* Faucet Button */}
            <div className={styles.gasFaucetContainer}>
              <button
                className={!isRegistered || !canClaimFaucet ? styles.gasFaucetButtonDisabled : styles.gasFaucetButton}
                onClick={handleFaucet}
                disabled={!isRegistered || !canClaimFaucet}
              >
                Faucet
              </button>
              <span className={styles.gasFaucetInfo}>
                ?
                <div className={styles.gasFaucetTooltip}>
                  <div className={styles.tooltipText}>Registered users can get a free swap to gas once a week</div>
                  <div className={styles.tooltipChecklist}>
                    <div className={`${styles.checklistItem} ${isRegistered ? 'checked' : ''}`}>
                      <span className={styles.checkmark}>{isRegistered ? '✓' : '✗'}</span>
                      Registered
                    </div>
                    <div className={`${styles.checklistItem} ${canClaimFaucet ? 'checked' : ''}`}>
                      <span className={styles.checkmark}>{canClaimFaucet ? '✓' : '✗'}</span>
                      Available to use
                    </div>
                  </div>
                </div>
              </span>
            </div>

            {/* Action Button */}
            <button className={styles.gasButton} onClick={handleSwapForGas} disabled={!amount || parseFloat(amount) <= 0 || !expectedScrt}>
              {fromToken === "SSCRT" ? "Unwrap" : "Swap for Gas"}
            </button>
          </div>
        );

      case "WrapUnwrap":
        const currentBalance = isWrapMode ? scrtBalance : sscrtBalance;
        const fromTokenInfo = isWrapMode ? { name: "SCRT", logo: null, isIcon: true } : { name: "SSCRT", logo: tokens.SSCRT.logo, isIcon: false };
        const toTokenInfo = isWrapMode ? { name: "SSCRT", logo: tokens.SSCRT.logo, isIcon: false } : { name: "SCRT", logo: null, isIcon: true };

        return (
          <div className={`${styles.gasTabcontent} ${styles.active}`}>
            {/* FROM INPUT */}
            <div className={styles.gasInputGroup}>
              <div className={styles.gasLabelWrapper}>
                <label className={styles.gasInputLabel}>From</label>
                <div className={styles.gasTokenBalance}>
                  {(!isWrapMode && sscrtBalance === "Error") ? (
                    <button className={styles.gasVkButton} onClick={handleRequestSscrtViewingKey}>
                      Get Viewing Key
                    </button>
                  ) : (
                    <>
                      Balance: {currentBalance ?? "..."}
                      <button
                        className={styles.gasMaxButton}
                        onClick={() => setWrapUnwrapAmount(currentBalance?.toString() || "")}
                      >
                        Max
                      </button>
                    </>
                  )}
                </div>
              </div>

              <div className={styles.gasInputWrapper}>
                {fromTokenInfo.isIcon ? (
                  <i className={`bx bxs-gas-pump ${styles.gasInputLogo}`} aria-hidden="true"></i>
                ) : (
                  <img src={fromTokenInfo.logo} alt={`${fromTokenInfo.name} logo`} className={styles.gasInputLogo} />
                )}
                <div className={styles.gasTokenName}>{fromTokenInfo.name}</div>
                <input
                  type="number"
                  className={styles.gasTokenInput}
                  placeholder="0.0"
                  value={wrapUnwrapAmount}
                  onChange={(e) => setWrapUnwrapAmount(e.target.value)}
                />
              </div>
            </div>

            {/* Toggle Button */}
            <div className={styles.gasToggleContainer}>
              <button className={styles.gasToggleButton} onClick={toggleWrapUnwrapMode}>
                <i className="bx bx-refresh" aria-hidden="true"></i>
              </button>
            </div>

            {/* TO INPUT (read-only) */}
            <div className={styles.gasInputGroup}>
              <div className={styles.gasLabelWrapper}>
                <label className={styles.gasInputLabel}>To</label>
                <div className={styles.gasTokenBalance}>
                  {(isWrapMode && sscrtBalance === "Error") ? (
                    <button className={styles.gasVkButton} onClick={handleRequestSscrtViewingKey}>
                      Get Viewing Key
                    </button>
                  ) : (
                    <>
                      Balance: {isWrapMode ? (sscrtBalance ?? "...") : (scrtBalance ?? "...")}
                    </>
                  )}
                </div>
              </div>

              <div className={styles.gasInputWrapper}>
                {toTokenInfo.isIcon ? (
                  <i className={`bx bxs-gas-pump ${styles.gasInputLogo}`} aria-hidden="true"></i>
                ) : (
                  <img src={toTokenInfo.logo} alt={`${toTokenInfo.name} logo`} className={styles.gasInputLogo} />
                )}
                <div className={styles.gasTokenName}>{toTokenInfo.name}</div>
                <input
                  type="number"
                  className={styles.gasTokenInput}
                  placeholder="0.0"
                  value={wrapUnwrapAmount}
                  disabled
                  readOnly
                />
              </div>
            </div>

            {/* Faucet Button */}
            <div className={styles.gasFaucetContainer}>
              <button
                className={!isRegistered || !canClaimFaucet ? styles.gasFaucetButtonDisabled : styles.gasFaucetButton}
                onClick={handleFaucet}
                disabled={!isRegistered || !canClaimFaucet}
              >
                Faucet
              </button>
              <span className={styles.gasFaucetInfo}>
                ?
                <div className={styles.gasFaucetTooltip}>
                  <div className={styles.tooltipText}>Registered users can get a free swap to gas once a week</div>
                  <div className={styles.tooltipChecklist}>
                    <div className={`${styles.checklistItem} ${isRegistered ? 'checked' : ''}`}>
                      <span className={styles.checkmark}>{isRegistered ? '\u2713' : '\u2717'}</span>
                      Registered
                    </div>
                    <div className={`${styles.checklistItem} ${canClaimFaucet ? 'checked' : ''}`}>
                      <span className={styles.checkmark}>{canClaimFaucet ? '\u2713' : '\u2717'}</span>
                      Available to use
                    </div>
                  </div>
                </div>
              </span>
            </div>

            {/* Action Button */}
            <button
              className={styles.gasButton}
              onClick={handleWrapUnwrap}
              disabled={!wrapUnwrapAmount || parseFloat(wrapUnwrapAmount) <= 0}
            >
              {isWrapMode ? "Wrap" : "Unwrap"}
            </button>
          </div>
        );

      default:
        return <div className={`${styles.gasTabcontent} ${styles.active}`}>Tab content not found</div>;
    }
  };

  return (
    <div className={styles.gasBox}>
      <StatusModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} animationState={animationState} />

      <div className={styles.gasTitleContainer}>
        <h2 className={styles.gasTitle}>Gas Station</h2>
      </div>

      {/* Tab Navigation */}
      <div className={styles.gasTab}>
        <button className={activeTab === "SwapForGas" ? "active" : ""} onClick={() => setActiveTab("SwapForGas")}>
          Swap for Gas
        </button>
        <button className={activeTab === "WrapUnwrap" ? "active" : ""} onClick={() => setActiveTab("WrapUnwrap")}>
          Wrap/Unwrap
        </button>
      </div>

      {/* Tab Content */}
      {renderTabContent()}
    </div>
  );
};

export default GasStation;