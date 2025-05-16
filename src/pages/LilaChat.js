import React, { useState, useEffect, useCallback, useRef } from "react";
import { SecretNetworkClient } from "secretjs";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FiCopy, FiCheck, FiSettings } from "react-icons/fi";
import { showLoadingScreen } from "../utils/uiUtils";
import "./LilaChat.css";

const TESTNET_NODE_URL = "https://pulsar.lcd.secretnodes.com";
const TESTNET_CHAIN_ID = "pulsar-3";
const TESTNET_WORKER_CONTRACT = "secret18cy3cgnmkft3ayma4nr37wgtj4faxfnrnngrlq";
const SERVER_API_URL = "/api/chat";

const secretNetworkClient = new SecretNetworkClient({
  url: TESTNET_NODE_URL,
  chainId: TESTNET_CHAIN_ID,
});

const LilaChat = () => {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copiedText, setCopiedText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [userAddress, setUserAddress] = useState("");
  const [initAttempted, setInitAttempted] = useState(false);

  const chatContainerRef = useRef(null);
  const thinkingRef = useRef(null);
  const userInteracted = useRef(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function connectTestnetKeplr() {
      const chainId = TESTNET_CHAIN_ID;
      if (!window.keplr) {
        console.error("Please install Keplr.");
        return;
      }
      try {
        await window.keplr.enable(chainId);
        const signer = window.getOfflineSignerOnlyAmino(chainId);
        const accounts = await signer.getAccounts();
        setUserAddress(accounts[0].address);
        console.log("Reconnected to testnet with account:", accounts[0].address);
      } catch (error) {
        console.error("Error reconnecting to testnet:", error);
      }
    }
    if (!userAddress) {
      connectTestnetKeplr();
    }
  }, [userAddress]);

  const fetchModels = useCallback(async () => {
    try {
      console.log("Fetching models...");
      const response = await secretNetworkClient.query.compute.queryContract({
        contract_address: TESTNET_WORKER_CONTRACT,
        query: { get_models: {} },
      });
      console.log("Models response:", response);
      if (response.models && response.models.length > 0) {
        setModels(response.models);
        setSelectedModel(response.models[0]);
      }
    } catch (error) {
      console.error("Error fetching models:", error);
    } finally {
      showLoadingScreen(false);
    }
  }, []);

  useEffect(() => {
    if (initAttempted) return;
    async function initializeApp() {
      setInitAttempted(true);
      try {
        await fetchModels();
      } catch (error) {
        console.error("Error during app initialization:", error);
      }
    }
    initializeApp();
  }, [fetchModels, initAttempted]);

  useEffect(() => {
    if (chatContainerRef.current) {
      const isNearBottom =
        chatContainerRef.current.scrollHeight - chatContainerRef.current.scrollTop <=
        chatContainerRef.current.clientHeight + 100;
      if (isNearBottom || !userInteracted.current) {
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        }, 0);
      }
    }
  }, [messages]);

  const updateThinkingContent = (content) => {
    if (thinkingRef.current) {
      thinkingRef.current.style.display = "block";
      thinkingRef.current.textContent = content;
      if (
        chatContainerRef.current &&
        (!userInteracted.current ||
          chatContainerRef.current.scrollHeight - chatContainerRef.current.scrollTop <=
            chatContainerRef.current.clientHeight + 100)
      ) {
        chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
      }
    }
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      console.log("Uploading image:", file.name);
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64ImageWithPrefix = e.target.result;
        const base64Image = base64ImageWithPrefix.split(',')[1];
        console.log("Base64 image (no prefix):", base64Image.slice(0, 50) + "...");
        setPendingImage(base64Image);
        setInput((prev) => (prev ? `${prev}\n[Image attached]` : "[Image attached]"));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async () => {
    if (!input || !selectedModel) return;

    userInteracted.current = false;
    setLoading(true);
    const controller = new AbortController();
    setAbortController(controller);

    const messageToSend = {
      role: "user",
      content: pendingImage
        ? [{ type: "text", text: input }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${pendingImage}` } }]
        : input,
    };
    const updatedMessages = [...messages, messageToSend];
    console.log("Messages to send:", JSON.stringify(updatedMessages, null, 2));
    setMessages(updatedMessages);
    setInput("");
    setPendingImage(null);

    try {
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      const response = await fetch(SERVER_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: updatedMessages,
          stream: true,
        }),
        signal: controller.signal,
      });

      const reader = response.body.getReader();
      let localIsThinking = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("Streaming completed.");
          setAbortController(null);
          break;
        }

        const text = new TextDecoder().decode(value);
        const lines = text.split("\n").filter(line => line.trim());
        for (const line of lines) {
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              let newContent = data.message.content;
              if (newContent.includes("<think>")) {
                localIsThinking = true;
                newContent = newContent.replace("<think>", "");
                updateThinkingContent("🤔 Thinking: " + newContent);
                continue;
              }
              if (newContent.includes("</think>")) {
                localIsThinking = false;
                newContent = newContent.replace("</think>", "");
                if (thinkingRef.current) {
                  thinkingRef.current.textContent += newContent;
                  if (chatContainerRef.current) {
                    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
                  }
                }
                continue;
              }
              if (localIsThinking) {
                if (thinkingRef.current) {
                  thinkingRef.current.textContent += newContent;
                  if (chatContainerRef.current) {
                    chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
                  }
                }
              } else {
                setMessages((prevMessages) => {
                  const lastMessage = prevMessages[prevMessages.length - 1];
                  if (lastMessage?.role === "assistant") {
                    return [
                      ...prevMessages.slice(0, -1),
                      { role: "assistant", content: lastMessage.content + newContent },
                    ];
                  }
                  return [...prevMessages, { role: "assistant", content: newContent }];
                });
              }
            }
          } catch (error) {
            console.error("Error parsing stream data:", error);
          }
        }
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("Streaming stopped.");
      } else {
        console.error("Error in handleSendMessage:", error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleStopStreaming = () => {
    if (abortController) {
      abortController.abort();
      setAbortController(null);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(text);
      setTimeout(() => setCopiedText(""), 2000);
    });
  };

  const components = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const text = String(children).replace(/\n$/, "");
      return !inline && match ? (
        <div className="secret-code-block-wrapper">
          <div
            className="secret-copy-button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => copyToClipboard(text)}
          >
            {copiedText === text ? <FiCheck color="#fff" size={16} /> : <FiCopy color="#fff" size={16} />}
          </div>
          <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" {...props}>
            {text}
          </SyntaxHighlighter>
        </div>
      ) : (
        <code className={className} {...props}>
          {children}
        </code>
      );
    },
    p({ node, children }) {
      const text = children?.[0];
      if (typeof text === "string") {
        const thinkPattern = /<think>(.*?)<\/think>/s;
        if (thinkPattern.test(text)) {
          return (
            <div className="secret-think-box">
              🤔 <span>{text.replace(thinkPattern, "$1")}</span>
            </div>
          );
        }
      }
      return <p>{children}</p>;
    },
  };

  return (
    <div className="secret-main-container">
      <div
        className="secret-chat-container"
        ref={chatContainerRef}
        onScroll={() => {
          if (chatContainerRef.current) {
            const isAtBottom =
              chatContainerRef.current.scrollHeight - chatContainerRef.current.scrollTop <=
              chatContainerRef.current.clientHeight + 20;
            userInteracted.current = !isAtBottom;
          }
        }}
      >
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`secret-message ${msg.role === "assistant" ? "secret-assistant" : "secret-user"}`}
          >
            {msg.role === "assistant" && <div className="secret-think-box" ref={thinkingRef}></div>}
            <div className="secret-message-content">
              <ReactMarkdown components={components}>
                {typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)}
              </ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
      <div className="secret-input-container">
        <div className="secret-settings-container">
          {selectedModel === "llama3.2-vision" && (
            <>
              <input
                type="file"
                accept="image/*"
                ref={fileInputRef}
                style={{ display: "none" }}
                onChange={handleImageUpload}
              />
              <button
                className="secret-upload-button"
                onClick={() => fileInputRef.current.click()}
                style={{ backgroundColor: "#ffeb3b", color: "#000", marginRight: "8px" }}
              >
                📷 Upload Image
              </button>
            </>
          )}
          <div className="secret-settings-icon" onClick={() => setSettingsOpen(!settingsOpen)}>
            <FiSettings size={24} />
          </div>
        </div>
        {settingsOpen && (
          <div className="secret-settings-dropdown">
            <label>AI Model:</label>
            <select
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                setPendingImage(null);
              }}
            >
              {models.map((model, index) => (
                <option key={index} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </div>
        )}
        <textarea
          className="secret-chat-input"
          placeholder="Ask Lila(लीला) anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
        />
        {abortController && (
          <button className="secret-stop-button" onClick={handleStopStreaming}>
            ⏹ Stop
          </button>
        )}
        <button className="secret-send-button" onClick={handleSendMessage} disabled={loading}>
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
    </div>
  );
};

export default LilaChat;