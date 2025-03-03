import React, { useState, useEffect, useRef } from "react";
import "./AgentChat.css";
import { showLoadingScreen } from "../utils/uiUtils";

function tryParseJson(str) {
  try {
    const match = str.match(/\{[\s\S]*?\}/);
    if (!match) return null;
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

export default function AgentChat() {
  const [messages, setMessages] = useState([]);
  const [userInput, setUserInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [needFileDialog, setNeedFileDialog] = useState(false);
  const [uploadTicket, setUploadTicket] = useState(null);

  const chatContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Initial greeting
  useEffect(() => {
    setMessages([{ role: "assistant", content: "Hello! I am a helpful AI agent." }]);
    showLoadingScreen(false);
  }, []);

  // Auto-scroll chat
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  const sendMessage = async () => {
    if (!userInput.trim()) return;

    const userMsg = { role: "user", content: userInput };
    setMessages((prev) => [...prev, userMsg]);
    setUserInput("");
    setLoading(true);

    try {
      const resp = await fetch("http://localhost:3001/api/execute-intent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: userInput }),
      });
      const data = await resp.json();

      const agentMsg = { role: "assistant", content: data.message || "" };
      const parsed = tryParseJson(data.message);

      if (parsed && parsed.success) {
        if (parsed.action === "request_image_upload" && parsed.ticket) {
          setNeedFileDialog(true);
          setUploadTicket(parsed.ticket);
          agentMsg.content = `${parsed.message} Click the "Upload Image" button below to proceed.`;
        }
      }

      setMessages((prev) => [...prev, agentMsg]);
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "Error: Could not connect to server." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = async (e) => {
    if (!e.target.files || e.target.files.length === 0) return;
    const file = e.target.files[0];

    setLoading(true);
    setMessages((prev) => [...prev, { role: "user", content: `Uploading file: ${file.name}` }]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      
      const resp = await fetch(`http://localhost:3001/api/upload-image?ticket=${uploadTicket}`, {
        method: "POST",
        body: formData,
      });
      const result = await resp.json();

      if (result.ocrResult) {
        setMessages((prev) => [...prev, { role: "assistant", content: `OCR Result: ${result.ocrResult}` }]);
      } else {
        setMessages((prev) => [...prev, { role: "assistant", content: result.error || "No text found in image." }]);
      }
    } catch (err) {
      console.error("File upload error:", err);
      setMessages((prev) => [...prev, { role: "assistant", content: "File upload failed." }]);
    } finally {
      setLoading(false);
      setNeedFileDialog(false);
      setUploadTicket(null);
      e.target.value = "";
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  return (
    <div className="agent-main-container">
      <div className="agent-chat-container" ref={chatContainerRef}>
        {messages.map((msg, idx) => (
          <div
            key={idx}
            className={`agent-message ${msg.role === "assistant" ? "assistant" : ""}`}
          >
            <div className="agent-message-content">{msg.content}</div>
          </div>
        ))}
        {loading && (
          <div className="agent-loading-container">
            <div className="agent-loading-dots">
              <div className="agent-dot" />
              <div className="agent-dot" />
              <div className="agent-dot" />
            </div>
          </div>
        )}
      </div>

      <div className="agent-input-container">
        <textarea
          className="agent-chat-input"
          placeholder="Type your message..."
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          className="agent-send-button"
          onClick={sendMessage}
          disabled={loading}
        >
          {loading ? "Sending..." : "Send"}
        </button>

        {needFileDialog && (
          <button
            className="agent-upload-button"
            onClick={() => fileInputRef.current?.click()}
          >
            Upload Image
          </button>
        )}
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        style={{ display: "none" }}
        onChange={handleFileChange}
      />
    </div>
  );
}