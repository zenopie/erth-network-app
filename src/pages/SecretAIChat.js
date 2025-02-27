import React, { useState, useEffect, useCallback, useRef } from "react";
import { SecretNetworkClient } from "secretjs";
import { ChatSecret, SECRET_AI_CONFIG } from "secretai";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FiCopy, FiCheck, FiSettings } from "react-icons/fi";
import { showLoadingScreen } from "../utils/uiUtils";
import "./SecretAIChat.css";

// Testnet configuration for the AI chat page
const TESTNET_NODE_URL = "https://pulsar.lcd.secretnodes.com";
const TESTNET_CHAIN_ID = "pulsar-3";
const TESTNET_WORKER_SMART_CONTRACT = SECRET_AI_CONFIG.SECRET_WORKER_SMART_CONTRACT_DEFAULT;
const TESTNET_WORKER_SMART_CONTRACT_HASH = "5aa970b41fd5514da7b7582cbf808815c20c8f92278ad88f98038e83526cdd12";
const TESTNET_STORAGE_CONTRACT = "secret1v47zuu6mnq9xzcps4fz7pnpr23d2sczmft26du";
const TESTNET_STORAGE_HASH = "3545985756548d7d9b85a7a609040fd41a2a0eeba03f81fa166a8063569b01fd";

const API_KEY = "bWFzdGVyQHNjcnRsYWJzLmNvbTpTZWNyZXROZXR3b3JrTWFzdGVyS2V5X18yMDI1";

const SecretAIChat = () => {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [urls, setUrls] = useState([]);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [messages, setMessages] = useState([]);
  const [savedConversations, setSavedConversations] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedText, setCopiedText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [thinkingText, setThinkingText] = useState("");
  const [userAddress, setUserAddress] = useState("");
  const [offlineSigner, setOfflineSigner] = useState(null);

  const chatContainerRef = useRef(null);
  const thinkingRef = useRef(null);
  const userInteracted = useRef(false);

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
        setOfflineSigner(signer);
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

  useEffect(() => {
    const handleBeforeUnload = () => {
      if (messages.length > 0 && userAddress) {
        const payload = JSON.stringify({ user: userAddress, conversation: messages });
        const blob = new Blob([payload], { type: "application/json" });
        navigator.sendBeacon("https://erth.network/api/save-conversation", blob);
      }
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [messages, userAddress]);

  const fetchModels = useCallback(async () => {
    try {
      const secretClient = new SecretNetworkClient({
        url: TESTNET_NODE_URL,
        chainId: TESTNET_CHAIN_ID,
      });
      const response = await secretClient.query.compute.queryContract({
        contract_address: TESTNET_WORKER_SMART_CONTRACT,
        code_hash: TESTNET_WORKER_SMART_CONTRACT_HASH,
        query: { get_models: {} },
      });
      if (response.models.length > 0) {
        setModels(response.models);
        setSelectedModel(response.models[0]);
        fetchUrls(response.models[0]);
      }
    } catch (error) {
      console.error("Error fetching models:", error);
    }
  }, []);

  const fetchUrls = async (model) => {
    try {
      const secretClient = new SecretNetworkClient({
        url: TESTNET_NODE_URL,
        chainId: TESTNET_CHAIN_ID,
      });
      const response = await secretClient.query.compute.queryContract({
        contract_address: TESTNET_WORKER_SMART_CONTRACT,
        code_hash: TESTNET_WORKER_SMART_CONTRACT_HASH,
        query: { get_u_r_ls: { model } },
      });
      if (response.urls.length > 0) {
        setUrls(response.urls);
        setSelectedUrl(response.urls[0]);
      }
      showLoadingScreen(false);
    } catch (error) {
      console.error("Error fetching URLs:", error);
    }
  };

  const fetchConversations = async () => {
    if (!userAddress) return;
    try {
      const secretClient = new SecretNetworkClient({
        url: TESTNET_NODE_URL,
        chainId: TESTNET_CHAIN_ID,
      });
      const response = await secretClient.query.compute.queryContract({
        contract_address: TESTNET_STORAGE_CONTRACT,
        code_hash: TESTNET_STORAGE_HASH,
        query: { query_conversation: { user: userAddress } },
      });
      console.log(response);
      setSavedConversations(response || []);
    } catch (error) {
      console.error("Error fetching conversations:", error);
    }
  };

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  useEffect(() => {
    if (userAddress) {
      fetchConversations();
    }
  }, [userAddress]);

  const saveConversation = async () => {
    if (!messages.length || !userAddress || !offlineSigner) return;
    setLoading(true);
    try {
      const secretClient = new SecretNetworkClient({
        url: TESTNET_NODE_URL,
        chainId: TESTNET_CHAIN_ID,
        wallet: offlineSigner,
        walletAddress: userAddress,
      });
      const tx = await secretClient.tx.compute.executeContract(
        {
          sender: userAddress,
          contract_address: TESTNET_STORAGE_CONTRACT,
          code_hash: TESTNET_STORAGE_HASH,
          msg: { save_conversation: { conversation: messages } },
          sent_funds: [],
        },
        { gasLimit: 200000 }
      );
      console.log("Conversation saved:", tx);
      fetchConversations();
    } catch (error) {
      console.error("Save error:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input || !selectedUrl || !selectedModel) return;
    setLoading(true);
    let localIsThinking = false;
    const controller = new AbortController();
    setAbortController(controller);
    try {
      const secretAiLLM = new ChatSecret({
        apiKey: API_KEY,
        model: selectedModel,
        stream: true,
        signal: controller.signal,
      });
      const updatedMessages = [...messages, { role: "user", content: input }];
      setMessages(updatedMessages);
      setInput("");
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);
      await secretAiLLM.chat(updatedMessages, {
        onMessage: (data) => {
          if (data.message?.content) {
            let newContent = data.message.content;
            if (newContent.includes("<think>")) {
              localIsThinking = true;
              newContent = newContent.replace("<think>", "");
              if (thinkingRef.current) {
                thinkingRef.current.style.display = "block";
                thinkingRef.current.textContent = "🤔 Thinking: " + newContent;
              }
              return;
            }
            if (newContent.includes("</think>")) {
              localIsThinking = false;
              newContent = newContent.replace("</think>", "");
              if (thinkingRef.current) {
                thinkingRef.current.textContent += newContent;
              }
              return;
            }
            if (localIsThinking) {
              if (thinkingRef.current) {
                thinkingRef.current.textContent += newContent;
              }
              setThinkingText((prev) => prev + newContent);
            } else {
              setMessages((prevMessages) => {
                const lastMessage = prevMessages[prevMessages.length - 1];
                if (lastMessage?.role === "assistant") {
                  return [
                    ...prevMessages.slice(0, -1),
                    { role: "assistant", content: lastMessage.content + newContent },
                  ];
                } else {
                  return [...prevMessages, { role: "assistant", content: newContent }];
                }
              });
            }
          }
        },
        onComplete: () => {
          setAbortController(null);
        },
        onError: (error) => console.error("Streaming error:", error),
      });
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("Streaming stopped.");
      } else {
        console.error("Error:", error);
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
      {/* Sidebar for past conversations */}
      <div className="secret-sidebar">
        <button className="secret-new-conversation-button" onClick={() => setMessages([])}>
          New Conversation
        </button>
        <h3>Past Conversations</h3>
        {savedConversations.map((conv, idx) => (
          <div key={idx} className="secret-sidebar-item" onClick={() => setMessages(conv)}>
            {`Conversation ${idx + 1}`}
          </div>
        ))}
      </div>
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
              <ReactMarkdown components={components}>{msg.content}</ReactMarkdown>
            </div>
          </div>
        ))}
      </div>
      <div className="secret-input-container">
        <div className="secret-settings-icon" onClick={() => setSettingsOpen(!settingsOpen)}>
          <FiSettings size={24} />
        </div>
        {settingsOpen && (
          <div className="secret-settings-dropdown">
            <label>AI Model:</label>
            <select
              value={selectedModel}
              onChange={(e) => {
                setSelectedModel(e.target.value);
                fetchUrls(e.target.value);
              }}
            >
              {models.map((model, index) => (
                <option key={index} value={model}>
                  {model}
                </option>
              ))}
            </select>
            <label>AI Instance:</label>
            <select value={selectedUrl} onChange={(e) => setSelectedUrl(e.target.value)}>
              {urls.map((url, index) => (
                <option key={index} value={url}>
                  {url}
                </option>
              ))}
            </select>
          </div>
        )}
        <textarea
          className="secret-chat-input"
          placeholder="Ask DeepSeek anything..."
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
        <button
          className="secret-save-button"
          onClick={saveConversation}
          disabled={loading || !messages.length}
        >
          Save Conversation
        </button>
      </div>
    </div>
  );
};

export default SecretAIChat;