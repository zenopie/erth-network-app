import express from "express";
import { ChatSecret } from "secretai";
import { create_react_agent } from "langchain/agents";
import { AgentExecutor } from "langchain/agents";
import { BufferMemory } from "langchain/memory";
import cors from "cors";
import bodyParser from "body-parser";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";

console.log("Starting server initialization...");

// Get the current file path and directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Path to the tokens.js file in the utils directory
const tokensPath = join(__dirname, "..", "src", "utils", "tokens.js");

// Read and parse tokens.js file
const tokenContent = fs.readFileSync(tokensPath, "utf8");
const tokenMatch = tokenContent.match(/const tokens = \{([\s\S]*?)\};/);
const tokensObject = {};

if (tokenMatch && tokenMatch[1]) {
  const tokenDefs = tokenMatch[1].trim();
  const tokenRegex = /(\w+):\s*\{([^}]+)\}/g;
  let match;

  while ((match = tokenRegex.exec(tokenDefs)) !== null) {
    const tokenSymbol = match[1];
    const tokenProps = match[2];

    const contractMatch = tokenProps.match(/contract:\s*"([^"]+)"/);
    const hashMatch = tokenProps.match(/hash:\s*"([^"]+)"/);
    const decimalsMatch = tokenProps.match(/decimals:\s*(\d+)/);

    tokensObject[tokenSymbol] = {
      symbol: tokenSymbol,
      contract: contractMatch ? contractMatch[1] : "",
      hash: hashMatch ? hashMatch[1] : "",
      decimals: decimalsMatch ? parseInt(decimalsMatch[1]) : 6,
    };
  }
}

console.log("Loaded token information:", Object.keys(tokensObject));

const app = express();

// Middleware
app.use(bodyParser.json());
app.use(
  cors({
    origin: "http://localhost:3000",
    methods: ["GET", "POST"],
    allowedHeaders: ["Content-Type"],
  })
);

const PORT = 5001;

console.log("Setting up SecretAI, tools, and memory...");

// SecretAI and LangChain setup
const API_KEY = "bWFzdGVyQHNjcnRsYWJzLmNvbTpTZWNyZXROZXR3b3JrTWFzdGVyS2V5X18yMDI1";
const MODEL = "llama3.2-vision";

// Custom KeplrActionTool as a plain class
class KeplrActionTool {
  constructor() {
    this.name = "keplr_action";
    this.description = `
      Crafts Keplr wallet actions for Secret Network mainnet.
      Input should be a JSON string or object with {type, recipient, amount, token (optional)}.
      Types: "transfer" (requires recipient, amount, token), "balance" (token optional), "ping".
      Returns a JSON string with action details.
    `;
  }

  async execute(input) {
    console.log("KeplrActionTool executed with:", input);
    try {
      const payload = typeof input === "string" ? JSON.parse(input) : input;
      console.log("Parsed Keplr action payload:", payload);

      // Enhance payload with token details if applicable
      if (payload.token && tokensObject[payload.token]) {
        const tokenDetails = tokensObject[payload.token];
        payload.contract = tokenDetails.contract;
        payload.hash = tokenDetails.hash;
        payload.decimals = tokenDetails.decimals;
      }

      return JSON.stringify({
        action: "keplr_prompt",
        payload: payload,
      });
    } catch (error) {
      console.error("Error in KeplrActionTool:", error);
      return JSON.stringify({ error: "Invalid Keplr action input" });
    }
  }
}

// Adapt KeplrActionTool for LangChain
const keplrToolInstance = new KeplrActionTool();
const keplrTool = {
  name: keplrToolInstance.name,
  description: keplrToolInstance.description,
  func: keplrToolInstance.execute.bind(keplrToolInstance), // Bind the execute method
};

// Initialize SecretAI LLM
const secretAiLLM = new ChatSecret({
  apiKey: API_KEY,
  model: MODEL,
  stream: false, // Disable streaming for simplicity with LangChain
});

// Memory setup
const memory = new BufferMemory({
  memoryKey: "chat_history",
  inputKey: "input",
  outputKey: "output",
});

// System prompt
const systemPrompt = `
You are an AI assistant integrated with Keplr wallet on Secret Network mainnet (secret-4). Your role is to:
1. Interpret user requests related to blockchain interactions on mainnet
2. Provide information about the user's mainnet wallet and network status
3. Use the "keplr_action" tool to craft and trigger Keplr wallet actions when appropriate

Keplr Wallet Context (Mainnet):
- Address: {{userAddress}}
Available tokens on Secret Network:
${Object.values(tokensObject)
  .map(
    (token) =>
      `- ${token.symbol}: contract ${token.contract}, hash ${token.hash}, decimals ${token.decimals}`
  )
  .join("\n")}

Token balances in your wallet (if provided):
{{tokenBalances}}

Use the "keplr_action" tool for blockchain actions with these types:
- Token transfer: {"type": "transfer", "recipient": "secret1...", "amount": "5000000", "token": "SYMBOL"}
  * amount in token's smallest units (e.g., 1 SCRT = 1000000 uscrt)
  * if token omitted, use sSCRT
- Check balance: {"type": "balance", "token": "SYMBOL"}
  * if token omitted, check native SCRT
- Network ping: {"type": "ping"}

Only use the tool when certain an action is needed. If unsure, ask for clarification.
`;

// Create the ReAct agent with tools
const tools = [keplrTool];
const agent = create_react_agent({
  llm: secretAiLLM,
  tools,
  prompt: systemPrompt,
});

// Create the executor with memory
const executor = AgentExecutor.fromAgentAndTools({
  agent,
  tools,
  memory,
  verbose: true,
});

// Agent handler function
async function handleAgentRequest(message, userAddress, tokens = null) {
  console.log("Handling agent request with message:", message);
  console.log("User address:", userAddress);
  if (tokens) {
    console.log("Received token information:", tokens);
  }

  try {
    // Prepare token balances string
    let tokenBalances = "";
    if (tokens?.availableTokens?.length > 0) {
      tokenBalances = tokens.availableTokens
        .map((token) => {
          const balanceInStandard = token.balance / Math.pow(10, token.decimals);
          return `- ${token.symbol}: ${balanceInStandard} ${token.symbol}`;
        })
        .join("\n");
    }

    // Replace placeholders in the prompt
    const formattedPrompt = systemPrompt
      .replace("{{userAddress}}", userAddress || "Not connected")
      .replace("{{tokenBalances}}", tokenBalances || "No balances provided");

    // Execute the agent with memory
    const result = await executor.run({
      input: message,
      prompt: formattedPrompt,
    });

    console.log("Agent result:", result);

    // Parse the result for Keplr actions (if any)
    let response = result.output || result;
    let keplrAction = null;

    if (typeof response === "string" && response.includes("keplr_prompt")) {
      try {
        const parsed = JSON.parse(response);
        if (parsed.action === "keplr_prompt") {
          keplrAction = parsed.payload;
          response = "Keplr action prepared.";
        }
      } catch (error) {
        console.error("Error parsing Keplr action from response:", error);
      }
    }

    return { response, keplrAction };
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

// File upload endpoint
app.post("/api/upload-image", async (req, res) => {
  console.log("Received file upload request");
  const ticket = req.query.ticket;

  if (!ticket) {
    return res.status(400).json({ error: "Upload ticket is required" });
  }

  res.json({
    success: true,
    ocrResult: "This is a placeholder OCR result. File processing is not fully implemented yet.",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});