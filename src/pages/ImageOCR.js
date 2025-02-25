import React, { useState, useEffect } from "react";
import { FiSettings, FiUpload } from "react-icons/fi"; // Changed FiSend to FiUpload
import ReactMarkdown from "react-markdown";
import "./ImageOCR.css";
import { showLoadingScreen } from "../utils/uiUtils";

const ImageOCR = () => {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [blockchainEnabled, setBlockchainEnabled] = useState(true);
  const [walletProvider, setWalletProvider] = useState("cdp");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    showLoadingScreen(false);
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUploadImage = async () => {
    if (!file) return;
    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: "Processing uploaded image..." }]);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("http://localhost:3001/api/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) throw new Error("Upload failed");

      const result = await response.json();
      const content = result.message || "Unexpected response";

      setMessages((prev) => [...prev, { role: "assistant", content: content.trim() }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${error.message}` },
      ]);
    } finally {
      setLoading(false);
      setFile(null); // Reset file input
    }
  };

  return (
    <div className="main-container">
      <div className="chat-container">
        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            <div className="message-content">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && (
          <div className="loading-container">
            Processing
            <span className="loading-dots">
              <span className="dot"></span>
              <span className="dot"></span>
              <span className="dot"></span>
            </span>
          </div>
        )}
      </div>
      <div className="chat-input-container">
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleFileChange}
          className="file-input" // Style this in CSS
          disabled={loading}
        />
        <button
          className="send-button"
          onClick={handleUploadImage}
          disabled={loading || !file}
        >
          <FiUpload size={18} />
        </button>
        <div className="settings-icon" onClick={() => setSettingsOpen(!settingsOpen)}>
          <FiSettings size={20} />
        </div>
        {settingsOpen && (
          <div className="settings-dropdown">
            <label>
              <input
                type="checkbox"
                checked={blockchainEnabled}
                onChange={(e) => setBlockchainEnabled(e.target.checked)}
              />
              Enable Blockchain Actions
            </label>
            <label>Wallet Provider:</label>
            <select
              value={walletProvider}
              onChange={(e) => setWalletProvider(e.target.value)}
            >
              <option value="cdp">Coinbase CDP</option>
              <option value="custom">Custom Wallet</option>
            </select>
          </div>
        )}
      </div>
    </div>
  );
};

export default ImageOCR;