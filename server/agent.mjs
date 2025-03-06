// ESM Version of agent.mjs
import express from "express";
import { ChatSecret, SECRET_AI_CONFIG } from "secretai";
import { Tool } from "langchain/tools";
import cors from "cors";
import bodyParser from "body-parser";

console.log("Starting server initialization...");

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(
  cors({
    origin: "http://localhost:3000", // React default port
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

const PORT = 5001;

console.log("Setting up SecretAI and tools...");

// SecretAI and LangChain setup with secretai v1.0.10
const API_KEY = "bWFzdGVyQHNjcnRsYWJzLmNvbTpTZWNyZXROZXR3b3JrTWFzdGVyS2V5X18yMDI1";
const MODEL = "llama3.2-vision"; // Make sure this matches an available model

// Custom tool for crafting Keplr actions
class KeplrActionTool extends Tool {
  name = "keplr_action";
  description =
    "Crafts Keplr wallet actions for Secret Network mainnet. Use <keplr-action>{type, recipient, amount} format.";

  async _call(input) {
    console.log("KeplrActionTool called with:", input);
    if (input.includes("<keplr-action>")) {
      const match = input.match(/<keplr-action>(\{.*?\})/);
      if (match) {
        try {
          const payload = JSON.parse(match[1]);
          console.log("Parsed Keplr action payload:", payload);
          return JSON.stringify({
            action: "keplr_prompt",
            payload: payload,
          });
        } catch (error) {
          console.error("Error parsing Keplr action:", error);
          return "Error parsing Keplr action.";
        }
      }
    }
    return "No Keplr action required.";
  }
}

// Agent handler function
async function handleAgentRequest(message, userAddress, tokens = null) {
  console.log("Handling agent request with message:", message);
  console.log("User address:", userAddress);
  if (tokens) {
    console.log("Received token information:", tokens);
  }

  try {
    // Initialize SecretAI instance for v1.0.10
    console.log("Creating SecretAI LLM instance...");

    // For v1.0.10, we don't need to specify the URL directly - the API key and config handle it
    const secretAiLLM = new ChatSecret({
      apiKey: API_KEY,
      model: MODEL,
      stream: true, // Using streaming like in SecretAIChat.js
    });

    console.log("SecretAI LLM instance created successfully");

    // Add token information to the system message if available
    let tokenInfo = "";
    if (tokens && tokens.availableTokens && tokens.availableTokens.length > 0) {
      tokenInfo = "\n\nAvailable tokens on Secret Network:\n";
      tokens.availableTokens.forEach((token) => {
        tokenInfo += `- ${token.symbol}: contract ${token.contract} with ${token.decimals} decimals\n`;
      });
    }

    const systemMessage = `
You are an AI assistant integrated with Keplr wallet on Secret Network mainnet (secret-4). Your role is to:
1. Interpret user requests related to blockchain interactions on mainnet
2. Provide information about the user's mainnet wallet and network status
3. Craft and trigger Keplr wallet actions on mainnet when appropriate

Keplr Wallet Context (Mainnet):
- Address: ${userAddress || "Not connected"}
${tokenInfo}

How to trigger a Keplr action:
- When a mainnet blockchain action is needed, respond with "<keplr-action>" followed by a JSON object
- Supported actions (executed on mainnet):
  - Token transfer: <keplr-action>{"type": "transfer", "recipient": "secret1...", "amount": "5000000", "token": "SYMBOL"}
    * amount should be specified in the token's small units (e.g., uscrt for SCRT, where 1 SCRT = 1000000 uscrt)
    * if token is not specified, sSCRT (wrapped SCRT) will be used by default
  - Check balance: <keplr-action>{"type": "balance", "token": "SYMBOL"}
    * if token is not specified, native SCRT balance will be checked
  - Network ping: <keplr-action>{"type": "ping"}
- Only include <keplr-action> when certain an action should be taken
- If unsure, ask for confirmation or more details
- Provide clear feedback about what you're doing
`;

    const messages = [
      { role: "system", content: systemMessage },
      { role: "user", content: message },
    ];

    console.log("Sending messages to SecretAI chat...");
    let response = "";

    // Using Promise to handle completion
    const chatPromise = new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("SecretAI API request timed out after 120 seconds"));
      }, 120000);

      // For v1.0.10, the API interface might have changed
      secretAiLLM
        .chat(messages, {
          onMessage: (data) => {
            console.log("Message received from SecretAI:", JSON.stringify(data).substring(0, 200) + "...");
            if (data.message?.content) {
              response += data.message.content;
            }
          },
          onComplete: () => {
            console.log("Chat completed with response length:", response.length);
            if (response.length > 200) {
              console.log("Response preview:", response.substring(0, 200) + "...");
            } else {
              console.log("Response:", response);
            }
            clearTimeout(timeoutId);
            resolve();
          },
          onError: (error) => {
            console.error("SecretAI chat error:", error);
            clearTimeout(timeoutId);
            reject(error);
          },
        })
        .catch((error) => {
          console.error("Exception in SecretAI chat:", error);
          clearTimeout(timeoutId);
          reject(error);
        });
    });

    try {
      await chatPromise;
      console.log("Chat promise resolved successfully");
    } catch (error) {
      console.error("Chat promise rejected:", error);
      throw error;
    }

    // Check for Keplr action
    console.log("Checking for Keplr action in response...");
    if (response.includes("<keplr-action>")) {
      const match = response.match(/<keplr-action>(\{.*?\})/);
      if (match) {
        const payload = JSON.parse(match[1]);
        console.log("Found Keplr action payload:", payload);
        return { response: response.replace(/<keplr-action>\{.*?\}/g, ""), keplrAction: payload };
      }
    }
    return { response };
  } catch (error) {
    console.error("Agent error:", error);
    throw error;
  }
}

// API endpoint
app.post("/api/agent", async (req, res) => {
  console.log("Received API request:", req.body);
  const { message, userAddress, tokens } = req.body;
  if (!message) {
    console.log("Missing message in request");
    return res.status(400).json({ error: "Message is required" });
  }

  try {
    const { response, keplrAction } = await handleAgentRequest(message, userAddress, tokens);
    console.log(
      "Sending response:",
      keplrAction ? { responseLength: response.length, keplrAction } : { responseLength: response.length }
    );
    res.json({ response, keplrAction });
  } catch (error) {
    console.error("Error processing request:", error);
    res.status(500).json({ error: "Failed to process request: " + error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
