import React, { useState, useEffect, useCallback } from "react";
import { snip, getUserAddress, querySnipBalance, query, contract } from "../utils/contractUtils";
import { ERTH_API_BASE_URL } from "../utils/config";
import { showLoadingScreen } from "../utils/uiUtils";
import { toMicroUnits } from "../utils/mathUtils";
import tokens from "../utils/tokens";
import contracts from "../utils/contracts";
import StatusModal from "../components/StatusModal";
import "./Bridge.css";

const Bridge = ({ isKeplrConnected }) => {
  const [activeTab, setActiveTab] = useState("Deposit");

  // Bridge info
  const [bridgeInfo, setBridgeInfo] = useState(null);
  const [bridgeBalance, setBridgeBalance] = useState(null);

  // Deposit state
  const [depositAddress, setDepositAddress] = useState(null);
  const [deposits, setDeposits] = useState([]);
  const [loadingAddress, setLoadingAddress] = useState(false);

  // Withdraw state
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [moneroAddress, setMoneroAddress] = useState("");
  const [xmrBalance, setXmrBalance] = useState(null);
  const [pendingWithdrawals, setPendingWithdrawals] = useState([]);
  const [completedWithdrawals, setCompletedWithdrawals] = useState([]);
  const [retryingMint, setRetryingMint] = useState(null);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [animationState, setAnimationState] = useState("loading");

  // Error state
  const [error, setError] = useState(null);

  // History sub-tab state
  const [historyTab, setHistoryTab] = useState("deposits");

  // Fetch bridge info
  const fetchBridgeInfo = useCallback(async () => {
    try {
      const response = await fetch(`${ERTH_API_BASE_URL}/bridge/info`);
      if (response.ok) {
        const data = await response.json();
        setBridgeInfo(data);
      }
    } catch (err) {
      console.error("Failed to fetch bridge info:", err);
    }
  }, []);

  // Fetch bridge balance
  const fetchBridgeBalance = useCallback(async () => {
    try {
      const response = await fetch(`${ERTH_API_BASE_URL}/bridge/balance`);
      if (response.ok) {
        const data = await response.json();
        setBridgeBalance(data);
      }
    } catch (err) {
      console.error("Failed to fetch bridge balance:", err);
    }
  }, []);

  // Fetch XMR token balance
  const fetchXmrBalance = useCallback(async () => {
    if (!isKeplrConnected || !tokens["XMR"]) return;
    try {
      const balance = await querySnipBalance(tokens["XMR"]);
      setXmrBalance(isNaN(balance) ? null : parseFloat(balance));
    } catch (err) {
      console.error("Failed to fetch XMR balance:", err);
    }
  }, [isKeplrConnected]);

  // Fetch pending withdrawals from contract
  const fetchPendingWithdrawals = useCallback(async () => {
    if (!isKeplrConnected || !contracts.xmr_bridge?.contract) return;
    const secretAddress = getUserAddress();
    if (!secretAddress) return;

    try {
      const result = await query(
        contracts.xmr_bridge.contract,
        contracts.xmr_bridge.hash,
        { get_pending_withdrawals: { address: secretAddress } }
      );
      setPendingWithdrawals(result.withdrawals || []);
    } catch (err) {
      console.error("Failed to fetch pending withdrawals:", err);
    }
  }, [isKeplrConnected]);

  // Fetch completed withdrawals from contract
  const fetchCompletedWithdrawals = useCallback(async () => {
    if (!isKeplrConnected || !contracts.xmr_bridge?.contract) return;
    const secretAddress = getUserAddress();
    if (!secretAddress) return;

    try {
      const result = await query(
        contracts.xmr_bridge.contract,
        contracts.xmr_bridge.hash,
        { get_completed_withdrawals: { address: secretAddress } }
      );
      setCompletedWithdrawals(result.withdrawals || []);
    } catch (err) {
      console.error("Failed to fetch completed withdrawals:", err);
    }
  }, [isKeplrConnected]);

  // Retry failed mint for a specific deposit
  const handleRetryMint = async (depositTxHash) => {
    const secretAddress = getUserAddress();
    if (!secretAddress) return;

    setRetryingMint(depositTxHash);
    setError(null);

    try {
      const response = await fetch(`${ERTH_API_BASE_URL}/bridge/retry-mint`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address: secretAddress,
          txid: depositTxHash
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        const errMsg = typeof errData.detail === 'string'
          ? errData.detail
          : JSON.stringify(errData.detail) || "Retry mint failed";
        throw new Error(errMsg);
      }

      // Refresh deposit status
      await fetchDepositStatus();
      await fetchXmrBalance();
    } catch (err) {
      console.error("Retry mint error:", err);
      setError(err.message);
    } finally {
      setRetryingMint(null);
    }
  };

  // Fetch deposit status
  const fetchDepositStatus = useCallback(async () => {
    const secretAddress = getUserAddress();
    if (!secretAddress) return;

    try {
      const response = await fetch(
        `${ERTH_API_BASE_URL}/bridge/deposit-status/${secretAddress}`
      );
      if (response.ok) {
        const data = await response.json();
        setDeposits(data.deposits || []);
        if (!depositAddress && data.deposit_address) {
          setDepositAddress(data.deposit_address);
        }
      }
    } catch (err) {
      console.error("Failed to fetch deposit status:", err);
    }
  }, [depositAddress]);

  // Generate deposit address via contract call
  const generateDepositAddress = async () => {
    const secretAddress = getUserAddress();
    if (!secretAddress) {
      setError("Wallet not connected");
      return;
    }

    if (!contracts.xmr_bridge?.contract) {
      setError("Bridge contract not configured");
      return;
    }

    setLoadingAddress(true);
    setError(null);
    showLoadingScreen(true);

    try {
      // First check if user already has a deposit index
      const indexResult = await query(
        contracts.xmr_bridge.contract,
        contracts.xmr_bridge.hash,
        { get_deposit_index: { address: secretAddress } }
      );

      // If no index exists, register for a deposit address
      if (indexResult.index === null || indexResult.index === undefined) {
        const registerResult = await contract(
          contracts.xmr_bridge.contract,
          contracts.xmr_bridge.hash,
          { register_deposit_address: {} }
        );

        if (registerResult.code !== 0) {
          throw new Error("Failed to register deposit address");
        }
      }

      // Notify backend to generate the Monero deposit address
      const response = await fetch(`${ERTH_API_BASE_URL}/bridge/deposit-address`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ secret_address: secretAddress }),
      });

      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || "Failed to generate deposit address");
      }

      const data = await response.json();
      setDepositAddress(data.monero_address);
    } catch (err) {
      console.error("Generate deposit address error:", err);
      setError(err.message || "Failed to generate deposit address");
    } finally {
      setLoadingAddress(false);
      showLoadingScreen(false);
    }
  };

  // Handle withdrawal
  const handleWithdraw = async () => {
    if (!isKeplrConnected) {
      setError("Wallet not connected");
      return;
    }

    const amount = parseFloat(withdrawAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Invalid amount");
      return;
    }

    if (!isValidMoneroAddress(moneroAddress)) {
      setError("Invalid Monero address");
      return;
    }

    if (!tokens["XMR"]) {
      setError("XMR token not found");
      return;
    }

    setIsModalOpen(true);
    setAnimationState("loading");
    setError(null);

    try {
      // Convert to atomic units (12 decimals for XMR)
      const amountMicro = toMicroUnits(amount, tokens["XMR"]);

      // Send tokens to bridge contract with Withdraw hook message
      const withdrawMsg = { withdraw: { monero_address: moneroAddress } };
      const withdrawResult = await snip(
        tokens["XMR"].contract,
        tokens["XMR"].hash,
        contracts.xmr_bridge.contract,
        contracts.xmr_bridge.hash,
        withdrawMsg,
        amountMicro.toString()
      );

      if (withdrawResult.code !== 0) {
        throw new Error("Withdrawal transaction failed");
      }

      // Request withdrawal processing from bridge backend
      const secretAddress = getUserAddress();
      const response = await fetch(`${ERTH_API_BASE_URL}/bridge/withdraw`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          secret_address: secretAddress,
        }),
      });

      if (!response.ok) {
        const errData = await response.json();
        const errMsg = typeof errData.detail === 'string'
          ? errData.detail
          : JSON.stringify(errData.detail) || "Withdrawal request failed";
        throw new Error(errMsg);
      }

      setAnimationState("success");
      setWithdrawAmount("");
      setMoneroAddress("");
      fetchXmrBalance();
      fetchPendingWithdrawals();
    } catch (err) {
      console.error("Withdrawal error:", err);
      setAnimationState("error");
      setError(err.message);
    }
  };

  // Validate Monero address
  const isValidMoneroAddress = (address) => {
    if (!address) return false;
    if (address.length === 95) {
      return address[0] === "4" || address[0] === "8";
    }
    if (address.length === 106) {
      return address[0] === "4";
    }
    return false;
  };

  // Format XMR amount
  const formatXmr = (amount) => {
    return parseFloat(amount).toFixed(6);
  };

  // Get status color
  const getStatusColor = (status) => {
    switch (status) {
      case "minted":
        return "#4caf50";
      case "confirming":
      case "ready":
        return "#ff9800";
      case "pending":
        return "#2196f3";
      case "failed":
        return "#f44336";
      default:
        return "#666";
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  // Initial data fetch
  useEffect(() => {
    if (isKeplrConnected) {
      showLoadingScreen(true);
      Promise.all([
        fetchBridgeInfo(),
        fetchBridgeBalance(),
        fetchDepositStatus(),
        fetchXmrBalance(),
        fetchPendingWithdrawals(),
        fetchCompletedWithdrawals(),
      ]).finally(() => showLoadingScreen(false));
    }
  }, [isKeplrConnected, fetchBridgeInfo, fetchBridgeBalance, fetchDepositStatus, fetchXmrBalance, fetchPendingWithdrawals, fetchCompletedWithdrawals]);

  // Poll for deposit status when there are pending deposits
  useEffect(() => {
    const hasPending = deposits.some(
      (d) => d.status === "pending" || d.status === "confirming" || d.status === "ready"
    );

    if (hasPending) {
      const interval = setInterval(() => {
        fetchDepositStatus();
        fetchXmrBalance();
      }, 30000);
      return () => clearInterval(interval);
    }
  }, [deposits, fetchDepositStatus, fetchXmrBalance]);

  // Poll for pending withdrawals when there are any
  useEffect(() => {
    if (pendingWithdrawals.length > 0) {
      const interval = setInterval(() => {
        fetchPendingWithdrawals();
        fetchCompletedWithdrawals();
      }, 10000);
      return () => clearInterval(interval);
    }
  }, [pendingWithdrawals, fetchPendingWithdrawals, fetchCompletedWithdrawals]);

  return (
    <div className="bridge-page-box">
      <StatusModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        animationState={animationState}
      />

      <div className="bridge-title-row">
        <img src="/images/coin/XMR.png" alt="Monero" className="bridge-logo" />
        <h2>Monero Bridge</h2>
      </div>

      {/* Tab Navigation */}
      <div className="bridge-page-tab">
        <button
          className={activeTab === "Deposit" ? "active" : ""}
          onClick={() => setActiveTab("Deposit")}
        >
          Deposit
        </button>
        <button
          className={activeTab === "Withdraw" ? "active" : ""}
          onClick={() => setActiveTab("Withdraw")}
        >
          Withdraw
        </button>
        <button
          className={activeTab === "History" ? "active" : ""}
          onClick={() => setActiveTab("History")}
        >
          History
        </button>
      </div>

      {/* Error Display */}
      {error && <div className="bridge-error">{error}</div>}

      {/* Deposit Tab */}
      {activeTab === "Deposit" && (
        <div className="bridge-page-tabcontent">
          {!bridgeInfo?.deposit_enabled ? (
            <div className="bridge-disabled">Deposits are currently disabled</div>
          ) : (
            <>
              {!depositAddress ? (
                <div className="bridge-generate-section">
                  <p className="bridge-info-text">
                    Generate a unique Monero address to deposit XMR and receive wrapped XMR tokens on Secret Network.
                  </p>
                  <button
                    className="bridge-page-button"
                    onClick={generateDepositAddress}
                    disabled={loadingAddress}
                  >
                    {loadingAddress ? "Generating..." : "Generate Deposit Address"}
                  </button>
                </div>
              ) : (
                <div className="bridge-deposit-section">
                  <div className="bridge-address-box">
                    <label className="bridge-label">Send XMR to:</label>
                    <div className="bridge-address-display">
                      <span className="bridge-address">{depositAddress}</span>
                      <button
                        className="bridge-copy-button"
                        onClick={() => copyToClipboard(depositAddress)}
                        title="Copy address"
                      >
                        <i className="bx bx-copy"></i>
                      </button>
                    </div>
                  </div>

                  <div className="bridge-info-row">
                    <span className="bridge-info-label">Confirmations Required:</span>
                    <span className="bridge-info-value">
                      {bridgeInfo?.confirmations_required || 20}
                    </span>
                  </div>

                  <div className="bridge-info-row">
                    <span className="bridge-info-label">Minimum Deposit:</span>
                    <span className="bridge-info-value">
                      {bridgeInfo?.min_deposit_xmr || 0.001} XMR
                    </span>
                  </div>

                  <div className="bridge-info-row">
                    <span className="bridge-info-label">Wallet Height:</span>
                    <span className="bridge-info-value">
                      {bridgeInfo?.wallet_height?.toLocaleString() || "--"}
                    </span>
                  </div>

                  <div className="bridge-info-row">
                    <span className="bridge-info-label">Fee (burns ERTH):</span>
                    <span className="bridge-info-value">0.5%</span>
                  </div>

                  <button
                    className="bridge-page-button secondary"
                    onClick={fetchDepositStatus}
                  >
                    Refresh Status
                  </button>
                </div>
              )}

              {/* Pending Deposits */}
              {deposits.filter(d => d.status !== "minted" && d.status !== "failed").length > 0 && (
                <div className="bridge-deposits-section">
                  <h3>Pending Deposits</h3>
                  <div className="bridge-deposits-list">
                    {deposits.filter(d => d.status !== "minted" && d.status !== "failed").map((deposit, index) => (
                      <div key={index} className="bridge-deposit-item">
                        <div className="bridge-deposit-row">
                          <span className="bridge-deposit-label">Amount:</span>
                          <span className="bridge-deposit-value">
                            {formatXmr(deposit.amount_xmr)} XMR
                          </span>
                        </div>
                        <div className="bridge-deposit-row">
                          <span className="bridge-deposit-label">Status:</span>
                          <span
                            className="bridge-deposit-status"
                            style={{ color: getStatusColor(deposit.status) }}
                          >
                            {deposit.status}
                            {deposit.status === "confirming" &&
                              ` (${deposit.confirmations}/${bridgeInfo?.confirmations_required || 20})`}
                          </span>
                        </div>
                        {deposit.mint_tx_hash && (
                          <div className="bridge-deposit-row">
                            <span className="bridge-deposit-label">Tx:</span>
                            <span className="bridge-deposit-value truncate">
                              {deposit.mint_tx_hash.slice(0, 16)}...
                            </span>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Withdraw Tab */}
      {activeTab === "Withdraw" && (
        <div className="bridge-page-tabcontent">
          {!bridgeInfo?.withdrawal_enabled ? (
            <div className="bridge-disabled">Withdrawals are currently disabled</div>
          ) : (
            <>
              <div className="bridge-input-group">
                <div className="bridge-label-wrapper">
                  <label className="bridge-input-label">Amount</label>
                  <div className="bridge-token-balance">
                    <span>Balance: {xmrBalance !== null ? formatXmr(xmrBalance) : "--"} XMR</span>
                    {xmrBalance !== null && xmrBalance > 0 && (
                      <button
                        className="bridge-max-button"
                        onClick={() => setWithdrawAmount(xmrBalance.toString())}
                      >
                        MAX
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="number"
                  className="bridge-input"
                  placeholder="0.0"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  min="0"
                  step="0.000001"
                />
              </div>

              <div className="bridge-input-group">
                <label className="bridge-input-label">Monero Destination Address</label>
                <input
                  type="text"
                  className="bridge-input"
                  placeholder="4... or 8..."
                  value={moneroAddress}
                  onChange={(e) => setMoneroAddress(e.target.value)}
                />
              </div>

              <div className="bridge-info-row">
                <span className="bridge-info-label">Minimum Withdrawal:</span>
                <span className="bridge-info-value">
                  {bridgeInfo?.min_withdrawal_xmr || 0.001} XMR
                </span>
              </div>

              {bridgeBalance && (
                <div className="bridge-info-row">
                  <span className="bridge-info-label">Bridge Liquidity:</span>
                  <span className="bridge-info-value">
                    {formatXmr(bridgeBalance.unlocked_balance_xmr)} XMR
                  </span>
                </div>
              )}

              <div className="bridge-info-row">
                <span className="bridge-info-label">Fee (burns ERTH):</span>
                <span className="bridge-info-value">0.5%</span>
              </div>

              <button
                className="bridge-page-button"
                onClick={handleWithdraw}
                disabled={
                  !withdrawAmount ||
                  !moneroAddress ||
                  parseFloat(withdrawAmount) <= 0 ||
                  !isValidMoneroAddress(moneroAddress)
                }
              >
                Withdraw XMR
              </button>

              <p className="bridge-note">
                Tokens will be burned and XMR sent to your address within ~30 seconds.
              </p>

              {/* Pending Withdrawals */}
              {pendingWithdrawals.length > 0 && (
                <div className="bridge-withdrawals-section">
                  <h3>Pending Withdrawals</h3>
                  <div className="bridge-withdrawals-list">
                    {pendingWithdrawals.map((withdrawal, index) => (
                      <div key={index} className="bridge-withdrawal-item">
                        <div className="bridge-withdrawal-row">
                          <span className="bridge-withdrawal-label">Amount:</span>
                          <span className="bridge-withdrawal-value">
                            {formatXmr(withdrawal.amount / 1e12)} XMR
                          </span>
                        </div>
                        <div className="bridge-withdrawal-row">
                          <span className="bridge-withdrawal-label">Destination:</span>
                          <span className="bridge-withdrawal-value truncate">
                            {withdrawal.monero_address.slice(0, 16)}...
                          </span>
                        </div>
                        <div className="bridge-withdrawal-row">
                          <span className="bridge-withdrawal-label">ID:</span>
                          <span className="bridge-withdrawal-value">
                            {withdrawal.id}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* History Tab */}
      {activeTab === "History" && (
        <div className="bridge-page-tabcontent">
          {/* History Sub-tabs */}
          <div className="bridge-history-subtabs">
            <button
              className={historyTab === "deposits" ? "active" : ""}
              onClick={() => setHistoryTab("deposits")}
            >
              Deposits
            </button>
            <button
              className={historyTab === "withdrawals" ? "active" : ""}
              onClick={() => setHistoryTab("withdrawals")}
            >
              Withdrawals
            </button>
          </div>

          {/* Deposit History */}
          {historyTab === "deposits" && (
            <>
              {deposits.length === 0 ? (
                <div className="bridge-disabled">No deposit history</div>
              ) : (
                <div className="bridge-history-list">
                  {deposits.map((deposit, index) => (
                    <div
                      key={`deposit-${index}`}
                      className={`bridge-history-item ${deposit.status === "failed" ? "failed" : ""}`}
                    >
                      <div className="bridge-history-row">
                        <span className="bridge-history-label">Amount:</span>
                        <span className="bridge-history-value">
                          {formatXmr(deposit.amount_xmr)} XMR
                        </span>
                      </div>
                      <div className="bridge-history-row">
                        <span className="bridge-history-label">Status:</span>
                        <span
                          className="bridge-history-status"
                          style={{ color: getStatusColor(deposit.status) }}
                        >
                          {deposit.status}
                          {deposit.status === "confirming" &&
                            ` (${deposit.confirmations}/${bridgeInfo?.confirmations_required || 20})`}
                        </span>
                      </div>
                      {deposit.txid && (
                        <div className="bridge-history-row">
                          <span className="bridge-history-label">Tx Hash:</span>
                          <span className="bridge-history-value truncate">
                            {deposit.txid.slice(0, 16)}...
                          </span>
                        </div>
                      )}
                      {deposit.mint_tx_hash && (
                        <div className="bridge-history-row">
                          <span className="bridge-history-label">Mint Tx:</span>
                          <span className="bridge-history-value truncate">
                            {deposit.mint_tx_hash.slice(0, 16)}...
                          </span>
                        </div>
                      )}
                      {deposit.status === "failed" && (
                        <button
                          className="bridge-retry-button"
                          onClick={() => handleRetryMint(deposit.txid)}
                          disabled={retryingMint === deposit.txid}
                        >
                          {retryingMint === deposit.txid ? "Retrying..." : "Retry Mint"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* Withdrawal History */}
          {historyTab === "withdrawals" && (
            <>
              {completedWithdrawals.length === 0 ? (
                <div className="bridge-disabled">No withdrawal history</div>
              ) : (
                <div className="bridge-history-list">
                  {completedWithdrawals.map((withdrawal, index) => (
                    <div key={`withdrawal-${index}`} className="bridge-history-item">
                      <div className="bridge-history-row">
                        <span className="bridge-history-label">Amount:</span>
                        <span className="bridge-history-value">
                          {formatXmr(withdrawal.amount / 1e12)} XMR
                        </span>
                      </div>
                      <div className="bridge-history-row">
                        <span className="bridge-history-label">Status:</span>
                        <span
                          className="bridge-history-status"
                          style={{ color: "#4caf50" }}
                        >
                          completed
                        </span>
                      </div>
                      <div className="bridge-history-row">
                        <span className="bridge-history-label">Destination:</span>
                        <span className="bridge-history-value truncate">
                          {withdrawal.monero_address.slice(0, 16)}...
                        </span>
                      </div>
                      {withdrawal.txid && (
                        <div className="bridge-history-row">
                          <span className="bridge-history-label">XMR Tx:</span>
                          <span className="bridge-history-value truncate">
                            {withdrawal.txid.slice(0, 16)}...
                          </span>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Bridge;
