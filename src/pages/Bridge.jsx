import React, { useState, useEffect, useCallback } from "react";
import { snip, getUserAddress, querySnipBalance, query, contract } from "../utils/contractUtils";
import { ERTH_API_BASE_URL } from "../utils/config";
import { useLoading } from "../contexts/LoadingContext";
import { useWallet } from "../contexts/WalletContext";
import { toMicroUnits } from "../utils/mathUtils";
import tokens from "../utils/tokens";
import contracts from "../utils/contracts";
import StatusModal from "../components/StatusModal";
import useTransaction from "../hooks/useTransaction";
import styles from "./Bridge.module.css";

const Bridge = () => {
  const { isKeplrConnected } = useWallet();
  const { showLoading, hideLoading } = useLoading();
  const { isModalOpen, animationState, execute, closeModal } = useTransaction();

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
    showLoading();

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
      hideLoading();
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

    setError(null);

    await execute(async () => {
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

      setWithdrawAmount("");
      setMoneroAddress("");
      fetchXmrBalance();
      fetchPendingWithdrawals();
    });
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

  // Fetch public data always, user data when connected
  useEffect(() => {
    showLoading();
    const fetches = [fetchBridgeInfo(), fetchBridgeBalance()];
    if (isKeplrConnected) {
      fetches.push(
        fetchDepositStatus(),
        fetchXmrBalance(),
        fetchPendingWithdrawals(),
        fetchCompletedWithdrawals()
      );
    }
    Promise.all(fetches).finally(() => hideLoading());
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
    <div className={styles.bridgePageBox}>
      <StatusModal
        isOpen={isModalOpen}
        onClose={closeModal}
        animationState={animationState}
      />

      <div className={styles.bridgeTitleRow}>
        <img src="/images/coin/XMR.png" alt="Monero" className={styles.bridgeLogo} />
        <h2>Monero Bridge</h2>
      </div>

      {/* Tab Navigation */}
      <div className={styles.bridgePageTab}>
        <button
          className={activeTab === "Deposit" ? styles.active : ""}
          onClick={() => setActiveTab("Deposit")}
        >
          Deposit
        </button>
        <button
          className={activeTab === "Withdraw" ? styles.active : ""}
          onClick={() => setActiveTab("Withdraw")}
        >
          Withdraw
        </button>
        <button
          className={activeTab === "History" ? styles.active : ""}
          onClick={() => setActiveTab("History")}
        >
          History
        </button>
      </div>

      {/* Error Display */}
      {error && <div className={styles.bridgeError}>{error}</div>}

      {/* Deposit Tab */}
      {activeTab === "Deposit" && (
        <div className={styles.bridgePageTabcontent}>
          {!bridgeInfo?.deposit_enabled ? (
            <div className={styles.bridgeDisabled}>Deposits are currently disabled</div>
          ) : (
            <>
              {!depositAddress ? (
                <div className={styles.bridgeGenerateSection}>
                  <p className={styles.bridgeInfoText}>
                    Generate a unique Monero address to deposit XMR and receive wrapped XMR tokens on Secret Network.
                  </p>
                  <button
                    className={styles.bridgePageButton}
                    onClick={generateDepositAddress}
                    disabled={loadingAddress}
                  >
                    {loadingAddress ? "Generating..." : "Generate Deposit Address"}
                  </button>
                </div>
              ) : (
                <div className={styles.bridgeDepositSection}>
                  <div className={styles.bridgeAddressBox}>
                    <label className={styles.bridgeLabel}>Send XMR to:</label>
                    <div className={styles.bridgeAddressDisplay}>
                      <span className={styles.bridgeAddress}>{depositAddress}</span>
                      <button
                        className={styles.bridgeCopyButton}
                        onClick={() => copyToClipboard(depositAddress)}
                        title="Copy address"
                      >
                        <i className="bx bx-copy"></i>
                      </button>
                    </div>
                  </div>

                  <div className={styles.bridgeInfoRow}>
                    <span className={styles.bridgeInfoLabel}>Confirmations Required:</span>
                    <span className={styles.bridgeInfoValue}>
                      {bridgeInfo?.confirmations_required || 20}
                    </span>
                  </div>

                  <div className={styles.bridgeInfoRow}>
                    <span className={styles.bridgeInfoLabel}>Minimum Deposit:</span>
                    <span className={styles.bridgeInfoValue}>
                      {bridgeInfo?.min_deposit_xmr || 0.001} XMR
                    </span>
                  </div>

                  <div className={styles.bridgeInfoRow}>
                    <span className={styles.bridgeInfoLabel}>Wallet Height:</span>
                    <span className={styles.bridgeInfoValue}>
                      {bridgeInfo?.wallet_height?.toLocaleString() || "--"}
                    </span>
                  </div>

                  <div className={styles.bridgeInfoRow}>
                    <span className={styles.bridgeInfoLabel}>Fee (burns ERTH):</span>
                    <span className={styles.bridgeInfoValue}>0.5%</span>
                  </div>

                  <button
                    className={`${styles.bridgePageButton} ${styles.secondary}`}
                    onClick={fetchDepositStatus}
                  >
                    Refresh Status
                  </button>
                </div>
              )}

              {/* Pending Deposits */}
              {deposits.filter(d => d.status !== "minted" && d.status !== "failed").length > 0 && (
                <div className={styles.bridgeDepositsSection}>
                  <h3>Pending Deposits</h3>
                  <div className={styles.bridgeDepositsList}>
                    {deposits.filter(d => d.status !== "minted" && d.status !== "failed").map((deposit, index) => (
                      <div key={index} className={styles.bridgeDepositItem}>
                        <div className={styles.bridgeDepositRow}>
                          <span className={styles.bridgeDepositLabel}>Amount:</span>
                          <span className={styles.bridgeDepositValue}>
                            {formatXmr(deposit.amount_xmr)} XMR
                          </span>
                        </div>
                        <div className={styles.bridgeDepositRow}>
                          <span className={styles.bridgeDepositLabel}>Status:</span>
                          <span
                            className={styles.bridgeDepositStatus}
                            style={{ color: getStatusColor(deposit.status) }}
                          >
                            {deposit.status}
                            {deposit.status === "confirming" &&
                              ` (${deposit.confirmations}/${bridgeInfo?.confirmations_required || 20})`}
                          </span>
                        </div>
                        {deposit.mint_tx_hash && (
                          <div className={styles.bridgeDepositRow}>
                            <span className={styles.bridgeDepositLabel}>Tx:</span>
                            <span className={`${styles.bridgeDepositValue} ${styles.truncate}`}>
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
        <div className={styles.bridgePageTabcontent}>
          {!bridgeInfo?.withdrawal_enabled ? (
            <div className={styles.bridgeDisabled}>Withdrawals are currently disabled</div>
          ) : (
            <>
              <div className={styles.bridgeInputGroup}>
                <div className={styles.bridgeLabelWrapper}>
                  <label className={styles.bridgeInputLabel}>Amount</label>
                  <div className={styles.bridgeTokenBalance}>
                    <span>Balance: {xmrBalance !== null ? formatXmr(xmrBalance) : "--"} XMR</span>
                    {xmrBalance !== null && xmrBalance > 0 && (
                      <button
                        className={styles.bridgeMaxButton}
                        onClick={() => setWithdrawAmount(xmrBalance.toString())}
                      >
                        MAX
                      </button>
                    )}
                  </div>
                </div>
                <input
                  type="number"
                  className={styles.bridgeInput}
                  placeholder="0.0"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  min="0"
                  step="0.000001"
                />
              </div>

              <div className={styles.bridgeInputGroup}>
                <label className={styles.bridgeInputLabel}>Monero Destination Address</label>
                <input
                  type="text"
                  className={styles.bridgeInput}
                  placeholder="4... or 8..."
                  value={moneroAddress}
                  onChange={(e) => setMoneroAddress(e.target.value)}
                />
              </div>

              <div className={styles.bridgeInfoRow}>
                <span className={styles.bridgeInfoLabel}>Minimum Withdrawal:</span>
                <span className={styles.bridgeInfoValue}>
                  {bridgeInfo?.min_withdrawal_xmr || 0.001} XMR
                </span>
              </div>

              {bridgeBalance && (
                <div className={styles.bridgeInfoRow}>
                  <span className={styles.bridgeInfoLabel}>Bridge Liquidity:</span>
                  <span className={styles.bridgeInfoValue}>
                    {formatXmr(bridgeBalance.unlocked_balance_xmr)} XMR
                  </span>
                </div>
              )}

              <div className={styles.bridgeInfoRow}>
                <span className={styles.bridgeInfoLabel}>Fee (burns ERTH):</span>
                <span className={styles.bridgeInfoValue}>0.5%</span>
              </div>

              <button
                className={styles.bridgePageButton}
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

              <p className={styles.bridgeNote}>
                Tokens will be burned and XMR sent to your address within ~30 seconds.
              </p>

              {/* Pending Withdrawals */}
              {pendingWithdrawals.length > 0 && (
                <div className={styles.bridgeWithdrawalsSection}>
                  <h3>Pending Withdrawals</h3>
                  <div className={styles.bridgeWithdrawalsList}>
                    {pendingWithdrawals.map((withdrawal, index) => (
                      <div key={index} className={styles.bridgeWithdrawalItem}>
                        <div className={styles.bridgeWithdrawalRow}>
                          <span className={styles.bridgeWithdrawalLabel}>Amount:</span>
                          <span className={styles.bridgeWithdrawalValue}>
                            {formatXmr(withdrawal.amount / 1e12)} XMR
                          </span>
                        </div>
                        <div className={styles.bridgeWithdrawalRow}>
                          <span className={styles.bridgeWithdrawalLabel}>Destination:</span>
                          <span className={`${styles.bridgeWithdrawalValue} ${styles.truncate}`}>
                            {withdrawal.monero_address.slice(0, 16)}...
                          </span>
                        </div>
                        <div className={styles.bridgeWithdrawalRow}>
                          <span className={styles.bridgeWithdrawalLabel}>ID:</span>
                          <span className={styles.bridgeWithdrawalValue}>
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
        <div className={styles.bridgePageTabcontent}>
          {/* History Sub-tabs */}
          <div className={styles.bridgeHistorySubtabs}>
            <button
              className={historyTab === "deposits" ? styles.active : ""}
              onClick={() => setHistoryTab("deposits")}
            >
              Deposits
            </button>
            <button
              className={historyTab === "withdrawals" ? styles.active : ""}
              onClick={() => setHistoryTab("withdrawals")}
            >
              Withdrawals
            </button>
          </div>

          {/* Deposit History */}
          {historyTab === "deposits" && (
            <>
              {deposits.length === 0 ? (
                <div className={styles.bridgeDisabled}>No deposit history</div>
              ) : (
                <div className={styles.bridgeHistoryList}>
                  {deposits.map((deposit, index) => (
                    <div
                      key={`deposit-${index}`}
                      className={`${styles.bridgeHistoryItem} ${deposit.status === "failed" ? styles.failed : ""}`}
                    >
                      <div className={styles.bridgeHistoryRow}>
                        <span className={styles.bridgeHistoryLabel}>Amount:</span>
                        <span className={styles.bridgeHistoryValue}>
                          {formatXmr(deposit.amount_xmr)} XMR
                        </span>
                      </div>
                      <div className={styles.bridgeHistoryRow}>
                        <span className={styles.bridgeHistoryLabel}>Status:</span>
                        <span
                          className={styles.bridgeHistoryStatus}
                          style={{ color: getStatusColor(deposit.status) }}
                        >
                          {deposit.status}
                          {deposit.status === "confirming" &&
                            ` (${deposit.confirmations}/${bridgeInfo?.confirmations_required || 20})`}
                        </span>
                      </div>
                      {deposit.txid && (
                        <div className={styles.bridgeHistoryRow}>
                          <span className={styles.bridgeHistoryLabel}>Tx Hash:</span>
                          <span className={`${styles.bridgeHistoryValue} ${styles.truncate}`}>
                            {deposit.txid.slice(0, 16)}...
                          </span>
                        </div>
                      )}
                      {deposit.mint_tx_hash && (
                        <div className={styles.bridgeHistoryRow}>
                          <span className={styles.bridgeHistoryLabel}>Mint Tx:</span>
                          <span className={`${styles.bridgeHistoryValue} ${styles.truncate}`}>
                            {deposit.mint_tx_hash.slice(0, 16)}...
                          </span>
                        </div>
                      )}
                      {deposit.status === "failed" && (
                        <button
                          className={styles.bridgeRetryButton}
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
                <div className={styles.bridgeDisabled}>No withdrawal history</div>
              ) : (
                <div className={styles.bridgeHistoryList}>
                  {completedWithdrawals.map((withdrawal, index) => (
                    <div key={`withdrawal-${index}`} className={styles.bridgeHistoryItem}>
                      <div className={styles.bridgeHistoryRow}>
                        <span className={styles.bridgeHistoryLabel}>Amount:</span>
                        <span className={styles.bridgeHistoryValue}>
                          {formatXmr(withdrawal.amount / 1e12)} XMR
                        </span>
                      </div>
                      <div className={styles.bridgeHistoryRow}>
                        <span className={styles.bridgeHistoryLabel}>Status:</span>
                        <span
                          className={styles.bridgeHistoryStatus}
                          style={{ color: "#4caf50" }}
                        >
                          completed
                        </span>
                      </div>
                      <div className={styles.bridgeHistoryRow}>
                        <span className={styles.bridgeHistoryLabel}>Destination:</span>
                        <span className={`${styles.bridgeHistoryValue} ${styles.truncate}`}>
                          {withdrawal.monero_address.slice(0, 16)}...
                        </span>
                      </div>
                      {withdrawal.txid && (
                        <div className={styles.bridgeHistoryRow}>
                          <span className={styles.bridgeHistoryLabel}>XMR Tx:</span>
                          <span className={`${styles.bridgeHistoryValue} ${styles.truncate}`}>
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
