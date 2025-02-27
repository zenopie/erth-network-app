import React, { useState, useEffect } from "react";
import { FiSettings, FiSend } from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import "./AgentChat.css";
import { showLoadingScreen } from "../utils/uiUtils";

const AgentChat = () => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [blockchainEnabled, setBlockchainEnabled] = useState(true);
  const [walletProvider, setWalletProvider] = useState("cdp");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    showLoadingScreen(false);
  }, []);

  const handleSendMessage = async () => {
    if (!input) return;
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: input }]);
    setInput("");
    try {
      const response = await fetch("http://localhost:3001/api/execute-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input }),
      });
      const result = await response.json();
      const content = result.message
        ? `${result.message}${result.txHash ? `\nTransaction: ${result.txHash}` : ''}`
        : result.error || "Unexpected response";
      setMessages((prev) => [...prev, { role: "assistant", content: content.trim() }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error communicating with the server." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="agent-main-container">
      <div className="agent-chat-container">
        {messages.map((msg, index) => (
          <div key={index} className={`agent-message ${msg.role}`}>
            <div className="agent-message-content">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && (
          <div className="agent-loading-container">
            Thinking
            <span className="agent-loading-dots">
              <span className="agent-dot"></span>
              <span className="agent-dot"></span>
              <span className="agent-dot"></span>
            </span>
          </div>
        )}
      </div>
      <div className="agent-input-container">
        <textarea
          className="agent-chat-input"
          placeholder="Ask AI to send crypto..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
        />
        <button className="agent-send-button" onClick={handleSendMessage} disabled={loading}>
          <FiSend size={18} />
        </button>
        <div className="agent-settings-icon" onClick={() => setSettingsOpen(!settingsOpen)}>
          <FiSettings size={20} />
        </div>
        {settingsOpen && (
          <div className="agent-settings-dropdown">
            <label>
              <input
                type="checkbox"
                checked={blockchainEnabled}
                onChange={(e) => setBlockchainEnabled(e.target.checked)}
              />
              Enable Blockchain Actions
            </label>
            <label>Wallet Provider:</label>
            <select value={walletProvider} onChange={(e) => setWalletProvider(e.target.value)}>
              <option value="cdp">Coinbase CDP</option>
              <option value="custom">Custom Wallet</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default AgentChat;