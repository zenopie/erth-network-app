import React, { useState, useEffect, useCallback, useRef } from "react";
import { SecretNetworkClient } from "secretjs";
import { ChatSecret, SECRET_AI_CONFIG } from "secretai";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FiCopy, FiCheck, FiSettings } from "react-icons/fi";
import { showLoadingScreen } from '../utils/uiUtils';
import "./SecretAIChat.css";

const SECRET_NODE_URL = SECRET_AI_CONFIG.SECRET_NODE_URL_DEFAULT;
const SECRET_CHAIN_ID = SECRET_AI_CONFIG.SECRET_CHAIN_ID_DEFAULT;
const LLM_URL = "https://erth.network/api/cors/" + SECRET_AI_CONFIG.DEFAULT_LLM_URL;
const SECRET_WORKER_SMART_CONTRACT =
  SECRET_AI_CONFIG.SECRET_WORKER_SMART_CONTRACT_DEFAULT;
const API_KEY =
  "bWFzdGVyQHNjcnRsYWJzLmNvbTpTZWNyZXROZXR3b3JrTWFzdGVyS2V5X18yMDI1"; // Replace with your actual API key

const SecretAIChat = () => {
  const [models, setModels] = useState([]);
  const [selectedModel, setSelectedModel] = useState("");
  const [urls, setUrls] = useState([]);
  const [selectedUrl, setSelectedUrl] = useState("");
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedText, setCopiedText] = useState("");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [abortController, setAbortController] = useState(null);
  const [thinkingText, setThinkingText] = useState("");

  const chatContainerRef = useRef(null);
  const thinkingRef = useRef(null);
  const userInteracted = useRef(false);

  useEffect(() => {
    if (!userInteracted.current && chatContainerRef.current) {
      chatContainerRef.current.scrollTop =
        chatContainerRef.current.scrollHeight;
    }
  }, [messages, thinkingText]);

  const handleScroll = () => {
    if (!chatContainerRef.current) return;
    const isAtBottom =
      chatContainerRef.current.scrollHeight -
        chatContainerRef.current.scrollTop <=
      chatContainerRef.current.clientHeight + 20;
    userInteracted.current = !isAtBottom;
  };

  const fetchModels = useCallback(async () => {
    try {
      const secretClient = new SecretNetworkClient({
        url: SECRET_NODE_URL,
        chainId: SECRET_CHAIN_ID,
      });

      const response = await secretClient.query.compute.queryContract({
        contract_address: SECRET_WORKER_SMART_CONTRACT,
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
        url: SECRET_NODE_URL,
        chainId: SECRET_CHAIN_ID,
      });

      const response = await secretClient.query.compute.queryContract({
        contract_address: SECRET_WORKER_SMART_CONTRACT,
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

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  const handleSendMessage = async () => {
    if (!input || !selectedUrl || !selectedModel) return;
    setLoading(true);

    let localIsThinking = false;

    const controller = new AbortController();
    setAbortController(controller);

    try {
      const secretAiLLM = new ChatSecret({
        apiKey: API_KEY,
        base_url: LLM_URL,
        model: selectedModel,
        stream: true,
        signal: controller.signal,
      });

      const updatedMessages = [...messages, { role: "user", content: input }];
      console.log("Sending to model:", updatedMessages);
      setMessages(updatedMessages);
      setInput("");

      // Start a placeholder assistant message
      setMessages((prev) => [...prev, { role: "assistant", content: "" }]);

      await secretAiLLM.chat(updatedMessages, {
        onMessage: (data) => {
          if (data.message?.content) {
            let newContent = data.message.content;

            // Start thinking mode
            if (newContent.includes("<think>")) {
              localIsThinking = true;
              newContent = newContent.replace("<think>", "");
              if (thinkingRef.current) {
                thinkingRef.current.style.display = "block";
                thinkingRef.current.textContent = "🤔 Thinking: " + newContent;
              }
              return;
            }

            // End thinking mode
            if (newContent.includes("</think>")) {
              localIsThinking = false;
              newContent = newContent.replace("</think>", "");
              if (thinkingRef.current) {
                thinkingRef.current.textContent += newContent;
              }
              return;
            }

            if (localIsThinking) {
              console.log("Thinking chunk:", newContent);
              if (thinkingRef.current) {
                thinkingRef.current.textContent += newContent;
              }
              setThinkingText(prev => prev + newContent);
            } else {
              console.log("Assistant chunk:", newContent);
              setMessages((prevMessages) => {
                const lastMessage = prevMessages[prevMessages.length - 1];
                if (lastMessage?.role === "assistant") {
                  return [
                    ...prevMessages.slice(0, -1),
                    {
                      role: "assistant",
                      content: lastMessage.content + newContent,
                    },
                  ];
                } else {
                  return [...prevMessages, { role: "assistant", content: newContent }];
                }
              });
            }
          }
        },
        onComplete: () => {
          console.log("🏁 Streaming complete.");
          setAbortController(null);
        },
        onError: (error) => console.error("🚨 Streaming error:", error),
      });
    } catch (error) {
      if (error.name === "AbortError") {
        console.log("⏹️ Streaming stopped.");
      } else {
        console.error("❌ Error:", error);
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
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopiedText(text);
        setTimeout(() => setCopiedText(""), 2000);
      })
      .catch((err) => console.error("❌ Copy failed:", err));
  };

  const components = {
    code({ node, inline, className, children, ...props }) {
      const match = /language-(\w+)/.exec(className || "");
      const text = String(children).replace(/\n$/, "");

      return !inline && match ? (
        <div className="code-block-wrapper">
          <div
            className="copy-button"
            onMouseDown={(e) => e.stopPropagation()}
            onClick={() => copyToClipboard(text)}
          >
            {copiedText === text ? (
              <FiCheck color="#fff" size={16} />
            ) : (
              <FiCopy color="#fff" size={16} />
            )}
          </div>
          <SyntaxHighlighter
            style={vscDarkPlus}
            language={match[1]}
            PreTag="div"
            {...props}
          >
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
            <div className="think-box">
              🤔 <span>{text.replace(thinkPattern, "$1")}</span>
            </div>
          );
        }
      }
      return <p>{children}</p>;
    },
  };

  return (
    <div className="main-container">

      <div
        className="chat-container"
        ref={chatContainerRef}
        onScroll={handleScroll}
      >
        

        {messages.map((msg, index) => (
          <div key={index} className={`message ${msg.role}`}>
            
            {msg.role === "assistant" && (
              <div className="think-box" ref={thinkingRef}></div>
            )}
            <div className="message-content">
              <ReactMarkdown components={components}>{msg.content}</ReactMarkdown>
            </div>
            {/* Thinking display via ref */}
             
          </div>
        ))}
      </div>

      

      

      <div className="input-container">
        <div className="settings-icon" onClick={() => setSettingsOpen(!settingsOpen)}>
        <FiSettings size={24} />
      </div>

      {settingsOpen && (
        <div className="settings-dropdown">
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
          <select
            value={selectedUrl}
            onChange={(e) => setSelectedUrl(e.target.value)}
          >
            {urls.map((url, index) => (
              <option key={index} value={url}>
                {url}
              </option>
            ))}
          </select>
        </div>
      )}
        <textarea
          className="chat-input"
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
          <button className="stop-button" onClick={handleStopStreaming}>
            ⏹ Stop
          </button>
        )}
        <button className="send-button" onClick={handleSendMessage} disabled={loading}>
          {loading ? "Sending..." : "Send"}
        </button>
      </div>
      
      
    </div>
  );
};

export default SecretAIChat;
