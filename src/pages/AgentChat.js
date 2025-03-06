import React, { useState, useEffect, useRef } from "react";
import "./AgentChat.css";
import { showLoadingScreen } from "../utils/uiUtils";
// eslint-disable-next-line no-unused-vars
import { connectKeplr, querySnipBalance, requestViewingKey, snip } from "../utils/contractUtils";

// eslint-disable-next-line no-unused-vars
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
  const [walletConnected, setWalletConnected] = useState(false);
  const [userAddress, setUserAddress] = useState("");
  const [secretjsClient, setSecretjsClient] = useState(null);

  const chatContainerRef = useRef(null);
  const fileInputRef = useRef(null);

  // Connect to Keplr on component mount
  useEffect(() => {
    async function initializeKeplr() {
      try {
        // eslint-disable-next-line no-unused-vars
        const { secretjs, walletName } = await connectKeplr();
        setSecretjsClient(secretjs);
        setUserAddress(secretjs.address);
        setWalletConnected(true);
        console.log("Connected to Keplr with address:", secretjs.address);
      } catch (error) {
        console.error("Failed to connect to Keplr:", error);
        setMessages((prev) => [
          ...prev,
          {
            role: "system",
            content: "Could not connect to Keplr wallet. Please make sure it's installed and unlocked.",
          },
        ]);
      }
    }

    initializeKeplr();
  }, []);

  // Initial greeting
  useEffect(() => {
    setMessages([
      {
        role: "assistant",
        content: "Hello! I am a helpful AI agent that can interact with your Secret Network wallet.",
      },
    ]);
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

    // Get token balances if available
    let availableTokens = [];
    if (walletConnected && secretjsClient) {
      try {
        // Try to get ERTH balance
        try {
          const erthBalance = await querySnipBalance({
            symbol: "ERTH",
            contract: "secret12rcfupthksd0s5vjtu3u7cx8elfthgzy9a3pgur37lvjym82lrdqjv52wn",
            hash: "b48d0fed83ab648def02c9cadd7b7923078202d5f1b29c9ea69a2b331f2f324c",
            decimals: 6,
          });

          if (erthBalance && erthBalance !== "Error") {
            availableTokens.push({
              symbol: "ERTH",
              contract: "secret12rcfupthksd0s5vjtu3u7cx8elfthgzy9a3pgur37lvjym82lrdqjv52wn",
              hash: "b48d0fed83ab648def02c9cadd7b7923078202d5f1b29c9ea69a2b331f2f324c",
              balance: erthBalance * 1000000, // Convert to micro units
              decimals: 6,
            });
          }
        } catch (error) {
          console.log("Error getting ERTH balance:", error);
          // Try to get a viewing key
          await requestViewingKey({
            symbol: "ERTH",
            contract: "secret12rcfupthksd0s5vjtu3u7cx8elfthgzy9a3pgur37lvjym82lrdqjv52wn",
            hash: "b48d0fed83ab648def02c9cadd7b7923078202d5f1b29c9ea69a2b331f2f324c",
          });
        }
      } catch (error) {
        console.error("Error fetching token balances:", error);
      }
    }

    try {
      const resp = await fetch("http://localhost:5001/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: userInput,
          userAddress: userAddress,
          tokens: { availableTokens },
        }),
      });
      const data = await resp.json();

      if (data.error) {
        setMessages((prev) => [...prev, { role: "assistant", content: `Error: ${data.error}` }]);
      } else {
        const agentMsg = { role: "assistant", content: data.response || "" };

        // Handle Keplr action if present
        if (data.keplrAction) {
          const keplrAction = data.keplrAction;

          // Process the Keplr action based on type
          if (keplrAction.type === "transfer" && keplrAction.recipient && keplrAction.amount) {
            try {
              if (!walletConnected) {
                throw new Error("Keplr wallet is not connected");
              }

              // Add the agent message first
              setMessages((prev) => [...prev, agentMsg]);

              // Show processing message
              setMessages((prev) => [
                ...prev,
                {
                  role: "system",
                  content: `Processing transfer request: ${keplrAction.amount} ${keplrAction.token || "SCRT"} to ${
                    keplrAction.recipient
                  }...`,
                },
              ]);

              // Check if we have contract details directly in the payload
              if (keplrAction.contract && keplrAction.hash) {
                try {
                  // Default empty message for token transfer
                  const emptyMsg = {};

                  // Execute the snip function to trigger Keplr popup
                  await snip(
                    keplrAction.contract,
                    keplrAction.hash,
                    keplrAction.recipient,
                    "", // recipient hash is not needed for simple transfers
                    emptyMsg,
                    keplrAction.amount
                  );

                  // Convert amount to standard units for display
                  const decimals = keplrAction.decimals || 6;
                  const amountInStandard = parseInt(keplrAction.amount) / Math.pow(10, decimals);

                  // Success message
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "system",
                      content: `✅ Transfer initiated! ${amountInStandard} ${keplrAction.token} sent to ${keplrAction.recipient}. Transaction is being processed on the blockchain.`,
                    },
                  ]);
                } catch (txError) {
                  console.error("Transaction error:", txError);
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "system",
                      content: `❌ Transaction failed: ${txError.message || "Unknown error"}`,
                    },
                  ]);
                }
              } else {
                // Fallback to finding token info for the requested token
                const token = availableTokens.find((t) => t.symbol === keplrAction.token);

                if (!token) {
                  throw new Error(
                    `Token ${keplrAction.token} details not found. Contract and hash are required for transfers.`
                  );
                }

                // Execute the token transfer with SNIP-20
                try {
                  // Default empty message for token transfer
                  const emptyMsg = {};

                  // Execute the snip function to trigger Keplr popup
                  await snip(
                    token.contract,
                    token.hash,
                    keplrAction.recipient,
                    "", // recipient hash is not needed for simple transfers
                    emptyMsg,
                    keplrAction.amount
                  );

                  // Success message
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "system",
                      content: `✅ Transfer initiated! ${parseInt(keplrAction.amount) / Math.pow(10, token.decimals)} ${
                        keplrAction.token
                      } sent to ${keplrAction.recipient}. Transaction is being processed on the blockchain.`,
                    },
                  ]);
                } catch (txError) {
                  console.error("Transaction error:", txError);
                  setMessages((prev) => [
                    ...prev,
                    {
                      role: "system",
                      content: `❌ Transaction failed: ${txError.message || "Unknown error"}`,
                    },
                  ]);
                }
              }
            } catch (error) {
              console.error("Keplr action error:", error);
              setMessages((prev) => [...prev, agentMsg]);
              setMessages((prev) => [
                ...prev,
                {
                  role: "system",
                  content: `Error processing transfer: ${error.message}`,
                },
              ]);
            }
          } else if (keplrAction.type === "balance") {
            // Handle balance check request
            const tokenSymbol = keplrAction.token || "SCRT";
            const token = availableTokens.find((t) => t.symbol === tokenSymbol);

            setMessages((prev) => [...prev, agentMsg]);

            if (token) {
              setMessages((prev) => [
                ...prev,
                {
                  role: "system",
                  content: `Your ${token.symbol} balance: ${token.balance / Math.pow(10, token.decimals)} ${
                    token.symbol
                  }`,
                },
              ]);
            } else {
              setMessages((prev) => [
                ...prev,
                {
                  role: "system",
                  content: `Balance information for ${tokenSymbol} not available.`,
                },
              ]);
            }
          } else {
            // Default case for unhandled action types
            setMessages((prev) => [...prev, agentMsg]);
            setMessages((prev) => [
              ...prev,
              {
                role: "system",
                content: `Unsupported action request: ${JSON.stringify(keplrAction)}`,
              },
            ]);
          }
        } else {
          // No Keplr action, just show the response
          setMessages((prev) => [...prev, agentMsg]);
        }
      }
    } catch (error) {
      console.error("Chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Error: Could not connect to agent server. Make sure the agent server is running on port 5001.",
        },
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

      const resp = await fetch(`http://localhost:5001/api/upload-image?ticket=${uploadTicket}`, {
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
            className={`agent-message ${msg.role === "assistant" ? "assistant" : ""} ${
              msg.role === "system" ? "system" : ""
            }`}
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
        <button className="agent-send-button" onClick={sendMessage} disabled={loading}>
          {loading ? "Sending..." : "Send"}
        </button>

        {needFileDialog && (
          <button className="agent-upload-button" onClick={() => fileInputRef.current?.click()}>
            Upload Image
          </button>
        )}
      </div>

      <input ref={fileInputRef} type="file" accept="image/*" style={{ display: "none" }} onChange={handleFileChange} />
    </div>
  );
}
