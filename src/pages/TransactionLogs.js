import React, { useState, useEffect } from "react";
import { showLoadingScreen } from "../utils/uiUtils";
import "./TransactionLogs.css";

const TransactionLogs = ({ isKeplrConnected }) => {
  const [logs, setLogs] = useState([]);
  const [invalidLogs, setInvalidLogs] = useState([]);
  const [sortField, setSortField] = useState("timestamp");
  const [sortDirection, setSortDirection] = useState("desc");
  const [selectedLog, setSelectedLog] = useState(null);

  // Fetch logs from localStorage
  useEffect(() => {
    if (!isKeplrConnected) {
      setLogs([]);
      setInvalidLogs([]);
      return;
    }
    try {
      const storedLogs = JSON.parse(localStorage.getItem("transactionLogs") || "[]");
      console.log("Raw stored logs:", storedLogs);

      const validLogs = storedLogs.filter(
        (log) => log && log.user_address && log.contract_address && log.contract_hash && log.tx_hash && log.timestamp
      );
      const invalidLogs = storedLogs.filter(
        (log) => !(log && log.user_address && log.contract_address && log.contract_hash && log.tx_hash && log.timestamp)
      );

      console.log("Valid logs:", validLogs);
      console.log("Invalid logs:", invalidLogs);

      setLogs(validLogs);
      setInvalidLogs(invalidLogs);
    } catch (error) {
      console.error("Error parsing transaction logs:", error);
      setLogs([]);
      setInvalidLogs([]);
    }
    showLoadingScreen(false);
  }, [isKeplrConnected]);

  // Handle sorting
  const handleSort = (field) => {
    const newDirection = sortField === field && sortDirection === "desc" ? "asc" : "desc";
    setSortField(field);
    setSortDirection(newDirection);

    const sortedLogs = [...logs].sort((a, b) => {
      if (field === "timestamp") {
        return newDirection === "desc"
          ? new Date(b[field]) - new Date(a[field])
          : new Date(a[field]) - new Date(b[field]);
      }
      if (field === "msg") {
        const aMsg = JSON.stringify(a[field] || "");
        const bMsg = JSON.stringify(b[field] || "");
        return newDirection === "desc" ? bMsg.localeCompare(aMsg) : aMsg.localeCompare(bMsg);
      }
      return newDirection === "desc"
        ? (b[field] || "").localeCompare(a[field] || "")
        : (a[field] || "").localeCompare(b[field] || "");
    });
    setLogs(sortedLogs);
  };

  // Clear all logs
  const handleClearLogs = () => {
    localStorage.setItem("transactionLogs", JSON.stringify([]));
    setLogs([]);
    setInvalidLogs([]);
  };

  // Helper to safely truncate strings or objects
  const truncate = (value, startLen = 10, endLen = 4) => {
    if (!value) return "N/A";
    const str = typeof value === "string" ? value : JSON.stringify(value);
    if (str.length <= startLen + endLen) return str;
    return `${str.slice(0, startLen)}...${str.slice(-endLen)}`;
  };

  // Handle row click to show full log details
  const handleRowClick = (log) => {
    setSelectedLog(log);
  };

  // Close modal
  const closeModal = () => {
    setSelectedLog(null);
  };

  return (
    <div className="transaction-logs-container">
      <h2>Transaction Logs</h2>
      {logs.length === 0 && invalidLogs.length === 0 ? (
        <p>No transactions logged yet.</p>
      ) : (
        <>
          <div className="logs-controls">
            <button onClick={handleClearLogs} className="clear-logs-button">
              Clear Logs
            </button>
          </div>

          <div className="logs-content">
            {/* Valid Logs Table */}
            {logs.length > 0 && (
              <>
                <h3>Valid Logs</h3>
                <table className="logs-table">
                  <thead>
                    <tr>
                      <th onClick={() => handleSort("timestamp")}>
                        Time {sortField === "timestamp" && (sortDirection === "desc" ? "↓" : "↑")}
                      </th>
                      <th onClick={() => handleSort("user_address")}>
                        User Address {sortField === "user_address" && (sortDirection === "desc" ? "↓" : "↑")}
                      </th>
                      <th onClick={() => handleSort("contract_address")}>
                        Contract Address {sortField === "contract_address" && (sortDirection === "desc" ? "↓" : "↑")}
                      </th>
                      <th onClick={() => handleSort("contract_hash")}>
                        Contract Hash {sortField === "contract_hash" && (sortDirection === "desc" ? "↓" : "↑")}
                      </th>
                      <th onClick={() => handleSort("tx_hash")}>
                        Tx Hash {sortField === "tx_hash" && (sortDirection === "desc" ? "↓" : "↑")}
                      </th>
                      <th onClick={() => handleSort("msg")}>
                        Message {sortField === "msg" && (sortDirection === "desc" ? "↓" : "↑")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {logs.map((log, index) => (
                      <tr key={`valid-${index}`} onClick={() => handleRowClick(log)} className="clickable-row">
                        <td>{new Date(log.timestamp).toLocaleString()}</td>
                        <td>{truncate(log.user_address)}</td>
                        <td>{truncate(log.contract_address)}</td>
                        <td>{truncate(log.contract_hash)}</td>
                        <td>{truncate(log.tx_hash)}</td>
                        <td>{truncate(log.msg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}

            {/* Invalid Logs Table */}
            {invalidLogs.length > 0 && (
              <>
                <h3>Invalid Logs</h3>
                <table className="logs-table invalid-logs-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>User Address</th>
                      <th>Contract Address</th>
                      <th>Contract Hash</th>
                      <th>Tx Hash</th>
                      <th>Message</th>
                    </tr>
                  </thead>
                  <tbody>
                    {invalidLogs.map((log, index) => (
                      <tr key={`invalid-${index}`} onClick={() => handleRowClick(log)} className="clickable-row">
                        <td>{log.timestamp ? new Date(log.timestamp).toLocaleString() : "N/A"}</td>
                        <td>{truncate(log.user_address)}</td>
                        <td>{truncate(log.contract_address)}</td>
                        <td>{truncate(log.contract_hash)}</td>
                        <td>{truncate(log.tx_hash)}</td>
                        <td>{truncate(log.msg)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </>
            )}
          </div>

          {/* Modal for full log details */}
          {selectedLog && (
            <div className="log-modal-overlay" onClick={closeModal}>
              <div className="log-modal" onClick={(e) => e.stopPropagation()}>
                <h3>Log Details</h3>
                <div className="log-details">
                  <div className="log-detail-item">
                    <strong>Time:</strong> <span>{new Date(selectedLog.timestamp).toLocaleString()}</span>
                  </div>
                  <div className="log-detail-item">
                    <strong>User Address:</strong> <span>{selectedLog.user_address || "N/A"}</span>
                  </div>
                  <div className="log-detail-item">
                    <strong>Contract Address:</strong> <span>{selectedLog.contract_address || "N/A"}</span>
                  </div>
                  <div className="log-detail-item">
                    <strong>Contract Hash:</strong> <span>{selectedLog.contract_hash || "N/A"}</span>
                  </div>
                  <div className="log-detail-item">
                    <strong>Tx Hash:</strong> <span>{selectedLog.tx_hash || "N/A"}</span>
                  </div>
                  <div className="log-detail-item">
                    <strong>Message:</strong>
                    <pre>{JSON.stringify(selectedLog.msg || "N/A", null, 2)}</pre>
                  </div>
                  {selectedLog.response && (
                    <div className="log-detail-item">
                      <strong>Response:</strong>
                      <pre>{JSON.stringify(selectedLog.response, null, 2)}</pre>
                    </div>
                  )}
                </div>
                <button onClick={closeModal} className="close-modal-button">
                  Close
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default TransactionLogs;
