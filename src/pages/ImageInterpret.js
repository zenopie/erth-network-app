import React, { useState, useEffect } from "react";
import { FiSettings, FiUpload } from "react-icons/fi";
import ReactMarkdown from "react-markdown";
import "./ImageInterpret.css";
import { showLoadingScreen } from "../utils/uiUtils";

const ImageInterpret = () => {
  const [messages, setMessages] = useState([]);
  const [file, setFile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [blockchainEnabled, setBlockchainEnabled] = useState(true);
  const [walletProvider, setWalletProvider] = useState("cdp");
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    showLoadingScreen(false);
  }, []);

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      const selectedFile = e.target.files[0];
      const validTypes = ["image/jpeg", "image/png"];
      if (!validTypes.includes(selectedFile.type)) {
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: "Error: Please upload a JPEG or PNG image." },
        ]);
        return;
      }
      setFile(selectedFile);
    }
  };

  const handleUploadImage = async () => {
    if (!file) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Please select an image to upload." },
      ]);
      return;
    }

    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: "Processing uploaded image..." }]); // Fixed: Removed extra parenthesis

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("http://localhost:3002/api/upload-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Upload failed: ${response.status} - ${errorText}`);
      }

      const result = await response.json();

      // Validate and format the response
      let content;
      if (!result || typeof result !== "object") {
        content = "Error: Invalid response from server.";
      } else if (result.error) {
        content = `Error: ${result.error}`;
      } else if (result.message) {
        const msg = result.message;
        if (typeof msg === "string") {
          content = msg;
        } else if (msg.identity && "isIdentity" in msg) {
          // Format identity object into a readable string
          content = msg.isIdentity
            ? `**Identity Extracted:**\n- Country: ${msg.identity.Country}\n- ID Number: ${msg.identity["ID Number"]}\n- Name: ${msg.identity.Name}`
            : `Unable to interpret as a complete ID: ${msg.identity}`;
        } else {
          content = "Error: Unexpected response format.";
        }
      } else {
        content = "Error: No message received from server.";
      }

      setMessages((prev) => [...prev, { role: "assistant", content }]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: `Error: ${error.message}` },
      ]);
    } finally {
      setLoading(false);
      setFile(null);
      // Reset file input
      const fileInput = document.querySelector(".image-file-input");
      if (fileInput) fileInput.value = "";
    }
  };

  return (
    <div className="image-main-container">
      <div className="image-chat-container">
        {messages.map((msg, index) => (
          <div key={index} className={`image-message ${msg.role}`}>
            <div className="image-message-content">
              <ReactMarkdown>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
        {loading && (
          <div className="image-loading-container">
            Processing
            <span className="image-loading-dots">
              <span className="image-dot"></span>
              <span className="image-dot"></span>
              <span className="image-dot"></span>
            </span>
          </div>
        )}
      </div>
      <div className="image-input-container">
        <input
          type="file"
          accept="image/jpeg,image/png"
          onChange={handleFileChange}
          className="image-file-input"
          disabled={loading}
        />
        <button
          className="image-send-button"
          onClick={handleUploadImage}
          disabled={loading || !file}
        >
          <FiUpload size={18} />
        </button>
        <div className="image-settings-icon" onClick={() => setSettingsOpen(!settingsOpen)}>
          <FiSettings size={20} />
        </div>
        {settingsOpen && (
          <div className="image-settings-dropdown">
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

export default ImageInterpret;