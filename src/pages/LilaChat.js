import React, { useState, useEffect, useCallback, useRef } from "react";
import { SecretNetworkClient } from "secretjs";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FiCopy, FiCheck, FiSettings } from "react-icons/fi";
import { showLoadingScreen } from "../utils/uiUtils"; // Assuming this utility exists
import "./LilaChat.css";

const TESTNET_NODE_URL = "https://pulsar.lcd.secretnodes.com";
const TESTNET_CHAIN_ID = "pulsar-3";
const TESTNET_WORKER_CONTRACT = "secret18cy3cgnmkft3ayma4nr37wgtj4faxfnrnngrlq";
const SERVER_API_URL = "https://erth.network/api/chat";

const secretNetworkClient = new SecretNetworkClient({
  url: TESTNET_NODE_URL,
  chainId: TESTNET_CHAIN_ID,
});

const THINK_TAG_REGEX = /<think>([\s\S]*?)<\/think>/gs;
const ALL_TAGS_REGEX = /<\/?think>/g;

const LilaChat = () => {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [loading, setLoading] = useState(false); // For sending messages
  const [copiedText, setCopiedText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [userAddress, setUserAddress] = useState("");
  const [initAttempted, setInitAttempted] = useState(false);

  const chatContainerRef = useRef(null);
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
    console.log("Component mounted, starting to fetch models...");
    setModelsLoading(true);
    try {
      const response = await secretNetworkClient.query.compute.queryContract({
        contract_address: TESTNET_WORKER_CONTRACT,
        query: { get_models: {} },
      });

      console.log("Received response from contract:", response);

      if (response && response.models && Array.isArray(response.models) && response.models.length > 0) {
        console.log("Models found:", response.models);
        setModels(response.models);
        setSelectedModel(response.models[0]);
      } else {
        console.warn("Contract query successful, but no models were found in the response.", response);
      }
    } catch (error) {
      console.error("CRITICAL: Failed to fetch models from the Secret contract.", error);
    } finally {
      console.log("Finished model fetching process.");
      setModelsLoading(false);
      // CHANGE: Restored the call to hide the initial loading screen
      showLoadingScreen(false);
    }
  }, []);

  useEffect(() => {
    if (!initAttempted) {
      setInitAttempted(true);
      fetchModels();
    }
  }, [fetchModels, initAttempted]);

  useEffect(() => {
    if (chatContainerRef.current) {
      const isNearBottom =
        chatContainerRef.current.scrollHeight - chatContainerRef.current.scrollTop <=
        chatContainerRef.current.clientHeight + 150;

      if (isNearBottom || !userInteracted.current) {
        setTimeout(() => {
          if (chatContainerRef.current) {
            chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
          }
        }, 0);
      }
    }
  }, [messages]);

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const base64ImageWithPrefix = e.target.result;
        const base64Image = base64ImageWithPrefix.split(',')[1];
        setPendingImage(base64Image);
        setInput((prev) => (prev ? `${prev}\n[Image attached]` : "[Image attached]"));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async () => {
    if (loading || modelsLoading || !input.trim() || !selectedModel) return;

    userInteracted.current = false;
    setLoading(true);
    const controller = new AbortController();
    setAbortController(controller);

    const userMessage = {
      role: "user",
      content: pendingImage
        ? [{ type: "text", text: input }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${pendingImage}` } }]
        : input,
    };
    
    const assistantPlaceholder = { role: "assistant", content: "", thinking: "" };
    const messagesToSend = [...messages, userMessage];
    
    setMessages([...messagesToSend, assistantPlaceholder]);
    setInput("");
    setPendingImage(null);

    try {
      const response = await fetch(SERVER_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: selectedModel,
          messages: messagesToSend,
          stream: true,
        }),
        signal: controller.signal,
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let fullResponseText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          console.log("Streaming completed.");
          setAbortController(null);
          break;
        }
        
        fullResponseText += decoder.decode(value, { stream: true });

        const thinkingParts = fullResponseText.match(THINK_TAG_REGEX) || [];
        const thinkingText = thinkingParts.join('\n').replace(ALL_TAGS_REGEX, "").trim();
        const visibleContent = fullResponseText.replace(THINK_TAG_REGEX, "").trim();

        setMessages((prevMessages) => {
          const newMessages = [...prevMessages];
          if (newMessages.length > 0) {
            newMessages[newMessages.length - 1] = {
              ...newMessages[newMessages.length - 1],
              content: visibleContent,
              thinking: thinkingText,
            };
          }
          return newMessages;
        });
      }
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("Streaming stopped.");
      } else {
        console.error("Error in handleSendMessage:", error);
        setMessages((prev) => {
            const last = prev[prev.length - 1];
            if (last && last.role === 'assistant') {
                const newMessages = [...prev.slice(0, -1)];
                return [...newMessages, { role: 'assistant', content: `Sorry, an error occurred: ${error.message}` }];
            }
            return [...prev, { role: 'assistant', content: `Sorry, an error occurred: ${error.message}` }];
        });
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
            {msg.role === "assistant" && msg.thinking && (
              <div className="secret-think-box">
                🤔 <pre>{msg.thinking}</pre>
              </div>
            )}
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
              disabled={modelsLoading}
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
          placeholder={
            modelsLoading ? "Loading available models..." :
            models.length > 0 ? "Ask Aya (آية) anything..." : "No AI models available. Check contract."
          }
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSendMessage();
            }
          }}
          disabled={modelsLoading || models.length === 0}
        />
        {abortController && (
          <button className="secret-stop-button" onClick={handleStopStreaming}>
            ⏹ Stop
          </button>
        )}
        <button
          className="secret-send-button"
          onClick={handleSendMessage}
          disabled={loading || modelsLoading || !input.trim() || !selectedModel}
        >
          {loading ? "Thinking..." : modelsLoading ? "Loading..." : "Send"}
        </button>
      </div>
    </div>
  );
};

export default LilaChat;