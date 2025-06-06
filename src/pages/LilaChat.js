import React, { useState, useEffect, useRef } from "react";
import { SecretNetworkClient } from "secretjs";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FiCopy, FiCheck, FiSettings, FiChevronDown, FiChevronUp } from "react-icons/fi";
import { showLoadingScreen } from "../utils/uiUtils";
import "./LilaChat.css";

const TESTNET_NODE_URL = "https://pulsar.lcd.secretnodes.com";
const TESTNET_CHAIN_ID = "pulsar-3";
const TESTNET_WORKER_CONTRACT = "secret18cy3cgnmkft3ayma4nr37wgtj4faxfnrnngrlq";
const SERVER_API_URL = "https://erth.network/api/chat";

const secretNetworkClient = new SecretNetworkClient({
  url: TESTNET_NODE_URL,
  chainId: TESTNET_CHAIN_ID,
});

// Regex to find a complete <think>...</think> block
const COMPLETE_THINK_TAG_REGEX = /<think>[\s\S]*?<\/think>/gs;
// Regex to find the start of a think block, for cleaning incomplete streams
const INCOMPLETE_THINK_TAG_REGEX = /<think>[\s\S]*/s;


const LilaChat = () => {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [modelsLoading, setModelsLoading] = useState(true);
  const [messages, setMessages] = useState([]);
  const [streamingThinkingText, setStreamingThinkingText] = useState("");
  const [isLiveThinkingExpanded, setIsLiveThinkingExpanded] = useState(true);
  const [expandedStates, setExpandedStates] = useState({});
  const [input, setInput] = useState("");
  const [pendingImage, setPendingImage] = useState(null);
  const [loading, setLoading] = useState(false);
  const [copiedText, setCopiedText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [userAddress, setUserAddress] = useState("");
  const [initAttempted, setInitAttempted] = useState(false);

  const chatContainerRef = useRef(null);
  const thinkingBoxRef = useRef(null);
  const userInteracted = useRef(false);
  const fileInputRef = useRef(null);

  useEffect(() => {
    async function connectTestnetKeplr() {
      if (!window.keplr) return console.error("Please install Keplr.");
      try {
        await window.keplr.enable(TESTNET_CHAIN_ID);
        const signer = window.getOfflineSignerOnlyAmino(TESTNET_CHAIN_ID);
        const accounts = await signer.getAccounts();
        setUserAddress(accounts[0].address);
      } catch (error) {
        console.error("Error reconnecting to testnet:", error);
      }
    }
    if (!userAddress) connectTestnetKeplr();
  }, [userAddress]);

  useEffect(() => {
    const fetchModels = async () => {
      setModelsLoading(true);
      try {
        const response = await secretNetworkClient.query.compute.queryContract({
          contract_address: TESTNET_WORKER_CONTRACT,
          query: { get_models: {} },
        });
        if (response?.models?.length) {
          setModels(response.models);
          setSelectedModel(response.models[0]);
        }
      } catch (error) {
        console.error("CRITICAL: Failed to fetch models.", error);
      } finally {
        setModelsLoading(false);
        showLoadingScreen(false);
      }
    };

    if (!initAttempted) {
      setInitAttempted(true);
      fetchModels();
    }
  }, [initAttempted]);

  useEffect(() => {
    if (chatContainerRef.current) {
      const isNearBottom = chatContainerRef.current.scrollHeight - chatContainerRef.current.scrollTop <= chatContainerRef.current.clientHeight + 150;
      if (isNearBottom || !userInteracted.current) {
        setTimeout(() => chatContainerRef.current?.scrollTo(0, chatContainerRef.current.scrollHeight), 0);
      }
    }
  }, [messages, streamingThinkingText]);

  useEffect(() => {
    if (thinkingBoxRef.current) {
      thinkingBoxRef.current.scrollTop = thinkingBoxRef.current.scrollHeight;
    }
  }, [streamingThinkingText]);

  const toggleHistoricThinkBox = (index) => {
    setExpandedStates(prev => ({ ...prev, [index]: !prev[index] }));
  };

  const handleImageUpload = (event) => {
    const file = event.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        setPendingImage(e.target.result.split(',')[1]);
        setInput((prev) => (prev ? `${prev}\n[Image attached]` : "[Image attached]"));
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendMessage = async () => {
    if (loading || modelsLoading || !input.trim() || !selectedModel) return;
    
    userInteracted.current = false;
    setLoading(true);
    setIsLiveThinkingExpanded(true);
    setSettingsOpen(false);
    const controller = new AbortController();
    setAbortController(controller);

    const userMessage = { role: "user", content: pendingImage ? [{ type: "text", text: input }, { type: "image_url", image_url: { url: `data:image/jpeg;base64,${pendingImage}` } }] : input };
    const assistantPlaceholder = { role: "assistant", content: "" };
    const messagesToSend = [...messages, userMessage];
    setMessages([...messagesToSend, assistantPlaceholder]);
    setInput("");
    setPendingImage(null);

    let finalThinkingText = "";

    try {
      const response = await fetch(SERVER_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel, messages: messagesToSend, stream: true }),
        signal: controller.signal,
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let fullResponseText = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex;
        while ((newlineIndex = buffer.indexOf('\n')) !== -1) {
            const line = buffer.slice(0, newlineIndex);
            buffer = buffer.slice(newlineIndex + 1);
            if (line.trim() === '') continue;

            try {
                const data = JSON.parse(line);
                if (data.message?.content) {
                    fullResponseText += data.message.content;

                    // --- FIX IS HERE: SEPARATE PARSING LOGIC ---
                    
                    // 1. Update the LIVE THINKING box
                    const thinkMatch = fullResponseText.match(/<think>([\s\S]*?)(?:<\/think>|$)/s);
                    if (thinkMatch && thinkMatch[1]) {
                        setStreamingThinkingText(thinkMatch[1]);
                    }

                    // 2. Update the MAIN CONTENT bubble
                    // First, remove any complete <think>...</think> blocks
                    let visibleContent = fullResponseText.replace(COMPLETE_THINK_TAG_REGEX, "");
                    // Then, remove any lingering, unclosed <think> tags for a clean display
                    visibleContent = visibleContent.replace(INCOMPLETE_THINK_TAG_REGEX, "").trim();
                    
                    setMessages(prev => {
                        const newMessages = [...prev];
                        if (newMessages.length > 0) {
                           newMessages[newMessages.length - 1].content = visibleContent;
                        }
                        return newMessages;
                    });
                }
            } catch (error) { console.warn("Could not parse JSON line:", line); }
        }
      }
      const finalThinkMatch = fullResponseText.match(/<think>([\s\S]*?)<\/think>/s);
      if (finalThinkMatch) finalThinkingText = finalThinkMatch[1].trim();

    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("Error in handleSendMessage:", error);
            setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: `Sorry, an error occurred: ${error.message}` }]);
        }
    } finally {
      if (finalThinkingText) {
          setMessages(prev => {
              const newMessages = [...prev];
              if (newMessages.length > 0) {
                 newMessages[newMessages.length - 1].thinking = finalThinkingText;
              }
              return newMessages;
          });
      }
      setStreamingThinkingText("");
      setLoading(false);
      setAbortController(null);
    }
  };

  const handleStopStreaming = () => abortController?.abort();

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
          <div className="secret-copy-button" onClick={() => copyToClipboard(text)}>
            {copiedText === text ? <FiCheck color="#fff" size={16} /> : <FiCopy color="#fff" size={16} />}
          </div>
          <SyntaxHighlighter style={vscDarkPlus} language={match[1]} PreTag="div" {...props}>{text}</SyntaxHighlighter>
        </div>
      ) : <code className={className} {...props}>{children}</code>;
    },
  };

  return (
    <div className="secret-main-container">
      <div className="secret-chat-container" ref={chatContainerRef}>
        {messages.map((msg, index) => (
          <div key={index} className={`secret-message ${msg.role === "assistant" ? "secret-assistant" : "secret-user"}`}>
            {msg.role === 'assistant' && msg.thinking && (
              <div className="secret-thinking-apparatus">
                <div className="secret-thinking-header">
                  <span>Thinking...</span>
                  <button className="secret-expand-button" onClick={() => toggleHistoricThinkBox(index)}>
                    {expandedStates[index] ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
                  </button>
                </div>
                <div className={`secret-think-box ${expandedStates[index] ? 'expanded' : ''}`}>
                  <pre>{msg.thinking}</pre>
                </div>
              </div>
            )}
            {msg.content && (
              <div className="secret-message-content">
                <ReactMarkdown components={components}>{msg.content}</ReactMarkdown>
              </div>
            )}
          </div>
        ))}
        {streamingThinkingText && (
          <div className="secret-message secret-assistant">
            <div className="secret-thinking-apparatus">
              <div className="secret-thinking-header">
                <span>Thinking...</span>
                <button className="secret-expand-button" onClick={() => setIsLiveThinkingExpanded(!isLiveThinkingExpanded)}>
                  {isLiveThinkingExpanded ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
                </button>
              </div>
              <div className={`secret-think-box live-expanded ${isLiveThinkingExpanded ? 'expanded' : ''}`}>
                <pre ref={thinkingBoxRef}>{streamingThinkingText}</pre>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="secret-input-container">
        {settingsOpen && (
          <div className="secret-settings-dropdown">
            <label>AI Model:</label>
            <select value={selectedModel} onChange={(e) => { setSelectedModel(e.target.value); setPendingImage(null); }} disabled={modelsLoading}>
              {models.map((model) => (<option key={model} value={model}>{model}</option>))}
            </select>
          </div>
        )}
        <textarea
          className="secret-chat-input"
          placeholder={modelsLoading ? "Loading available models..." : "Ask Aya (آية) anything..."}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
          disabled={loading || modelsLoading || models.length === 0}
        />
        <div className="secret-settings-container">
          {selectedModel === "llama3.2-vision" && (
            <>
              <input type="file" accept="image/*" ref={fileInputRef} style={{ display: "none" }} onChange={handleImageUpload} />
              <button className="secret-upload-button" onClick={() => fileInputRef.current?.click()} style={{ backgroundColor: "#ffeb3b", color: "#000", marginRight: "8px" }}>
                📷 Upload
              </button>
            </>
          )}
          <div className="secret-settings-icon" onClick={() => setSettingsOpen(!settingsOpen)}>
            <FiSettings size={24} />
          </div>
        </div>
        {loading && <button className="secret-stop-button" onClick={handleStopStreaming}>⏹ Stop</button>}
        <button
          className="secret-send-button"
          onClick={handleSendMessage}
          disabled={loading || modelsLoading || !input.trim() || !selectedModel}
        >
          {loading ? "Thinking..." : "Send"}
        </button>
      </div>
    </div>
  );
};

export default LilaChat;