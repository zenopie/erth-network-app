import React, { useState, useEffect, useRef } from "react";
// The SecretNetworkClient import has been removed.
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
import { FiCopy, FiCheck, FiChevronDown, FiChevronUp } from "react-icons/fi";
import { showLoadingScreen } from "../utils/uiUtils";
import "./LilaChat.css";
import { ERTH_API_BASE_URL } from '../utils/config';

// Testnet and worker constants have been removed.
const SERVER_API_URL = `${ERTH_API_BASE_URL}/chat`;

// The SecretNetworkClient instantiation has been removed.

const LilaChat = () => {
  const selectedModel = "llama3.2-vision"; // Hardcoded default model
  const [messages, setMessages] = useState([]);
  const [streamingThinkingText, setStreamingThinkingText] = useState("");
  const [isLiveThinkingExpanded, setIsLiveThinkingExpanded] = useState(false);
  const [expandedStates, setExpandedStates] = useState({});
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [copiedText, setCopiedText] = useState("");
  const [abortController, setAbortController] = useState(null);

  const chatContainerRef = useRef(null);
  const thinkingBoxRef = useRef(null);
  const userInteracted = useRef(false);

  useEffect(() => {
    showLoadingScreen(false);
  }, []);

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

  const handleSendMessage = async () => {
    if (loading || !input.trim() || !selectedModel) return;

    userInteracted.current = false;
    setLoading(true);
    setIsLiveThinkingExpanded(false);
    const controller = new AbortController();
    setAbortController(controller);

    const userMessage = { role: "user", content: input };
    const assistantPlaceholder = { role: "assistant", content: "" };
    const messagesToSend = messages.concat(userMessage);
    setMessages([...messagesToSend, assistantPlaceholder]);
    setInput("");
    
    let fullResponseText = "";
    const thinkRegex = /<think>([\s\S]*?)<\/think>/gs;

    try {
      const response = await fetch(SERVER_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ model: selectedModel, messages: messagesToSend, stream: true }),
        signal: controller.signal,
      });

      console.log("Server response:", response);

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamDone = false;
      
      while (!streamDone) {
        const { done, value } = await reader.read();
        if (done) break;
    
        buffer += decoder.decode(value, { stream: true });
        // Split on newlines (handle CRLF). Keep the last partial chunk in buffer.
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop();
    
        for (let rawLine of lines) {
          let line = rawLine.trim();
          if (!line) continue;
    
          // Support SSE-style "data: {...}" lines and plain JSON lines.
          if (line.startsWith("data:")) {
            line = line.replace(/^data:\s*/, "");
            if (line === "[DONE]") {
              streamDone = true;
              break;
            }
          }
    
          try {
            const data = JSON.parse(line);
            if (data.message?.content) {
              fullResponseText += data.message.content;
    
              const completedThinks = [];
              thinkRegex.lastIndex = 0;
              let match;
              while ((match = thinkRegex.exec(fullResponseText)) !== null) {
                completedThinks.push(match[1].trim());
              }
              const finalizedThinkingText = completedThinks.join("\n\n---\n\n");
    
              let liveThinkingText = "";
              const lastThinkStart = fullResponseText.lastIndexOf("<think>");
              const lastThinkEnd = fullResponseText.lastIndexOf("</think>");
              if (lastThinkStart !== -1 && lastThinkStart > lastThinkEnd) {
                liveThinkingText = fullResponseText.substring(lastThinkStart + 7);
              }
              setStreamingThinkingText(liveThinkingText);
    
              const visibleContent = fullResponseText
                .replace(thinkRegex, "")
                .replace(/<think>[\s\S]*/s, "")
                .trim();
    
              setMessages(prev => {
                const newMessages = [...prev];
                const lastMessage = newMessages[newMessages.length - 1];
                if (lastMessage?.role === 'assistant') {
                  lastMessage.content = visibleContent;
                  if (finalizedThinkingText.length > 0) {
                    lastMessage.thinking = finalizedThinkingText;
                  }
                }
                return newMessages;
              });
            }
          } catch (error) {
            console.warn("Could not parse JSON line:", line);
          }
        }
      }
    } catch (error) {
        if (error.name !== "AbortError") {
            console.error("Error in handleSendMessage:", error);
            setMessages(prev => [...prev.slice(0, -1), { role: 'assistant', content: `Sorry, an error occurred: ${error.message}` }]);
        }
    } finally {
        thinkRegex.lastIndex = 0;
        const finalThinkBlocks = [];
        let match;
        while ((match = thinkRegex.exec(fullResponseText)) !== null) {
            finalThinkBlocks.push(match[1].trim());
        }
        const finalThinking = finalThinkBlocks.join("\n\n---\n\n");
        const finalContent = fullResponseText.replace(thinkRegex, "").trim();

        setMessages(prev => {
            const newMessages = [...prev];
            const lastMessage = newMessages[newMessages.length - 1];
            if (lastMessage?.role === 'assistant') {
                lastMessage.content = finalContent;
                if (finalThinking.length > 0) {
                    lastMessage.thinking = finalThinking;
                } else {
                    delete lastMessage.thinking;
                }
            }
            return newMessages;
        });
      
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
        {messages.map((msg, index) => {
          const isLastMessage = index === messages.length - 1;
          
          return (
            <div key={index} className={`secret-message ${msg.role === "assistant" ? "secret-assistant" : "secret-user"}`}>
              
              {/* Render HISTORIC thoughts box (will only exist if thinking text was not empty) */}
              {msg.role === 'assistant' && msg.thinking && (
                <div className="secret-thinking-apparatus">
                  <div className="secret-thinking-header">
                    <span>Thoughts</span>
                    <button className="secret-expand-button" onClick={() => toggleHistoricThinkBox(index)}>
                      {expandedStates[index] ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
                    </button>
                  </div>
                  <div className={`secret-think-box ${expandedStates[index] ? 'expanded' : ''}`}>
                    <pre>{msg.thinking}</pre>
                  </div>
                </div>
              )}

              {/* Render LIVE thinking box only if there's non-whitespace text */}
              {isLastMessage && streamingThinkingText.trim().length > 0 && (
                <div className="secret-thinking-apparatus">
                  <div className="secret-thinking-header">
                    <span>Thinking...</span>
                    <button className="secret-expand-button" onClick={() => setIsLiveThinkingExpanded(!isLiveThinkingExpanded)}>
                      {isLiveThinkingExpanded ? <FiChevronUp size={18} /> : <FiChevronDown size={18} />}
                    </button>
                  </div>
                  <div className={`secret-think-box live-preview ${isLiveThinkingExpanded ? 'expanded' : ''}`}>
                    <pre ref={thinkingBoxRef}>{streamingThinkingText}</pre>
                  </div>
                </div>
              )}

              {/* 
                Render the message content bubble only if it has actual content.
                This prevents an empty bubble from showing while the AI is "thinking"
                but hasn't produced any user-visible output yet.
              */}
              {msg.content && (
                 <div className="secret-message-content">
                    <ReactMarkdown components={components}>{msg.content}</ReactMarkdown>
                 </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="secret-input-container">
        <textarea
          className="secret-chat-input"
          placeholder="Ask Aya (آية) anything..."
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendMessage(); } }}
          disabled={loading}
        />
        {loading && <button className="secret-stop-button" onClick={handleStopStreaming}>⏹ Stop</button>}
        <button
          className="secret-send-button"
          onClick={handleSendMessage}
          disabled={loading || !input.trim() || !selectedModel}
        >
          {loading ? "Thinking..." : "Send"}
        </button>
      </div>
    </div>
  );
};

export default LilaChat;