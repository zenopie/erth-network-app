const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const { Wallet, SecretNetworkClient, MsgExecuteContract } = require("secretjs");
const cors = require("cors");
const { initAnalytics, getLatestData, getAllData } = require("./analyticsManager");

const app = express();
const WEBHOOK_PORT = 5000; // Port for HTTPS

// Middleware to parse JSON requests
app.use(bodyParser.json());

// Enable CORS for all routes or specific origins
const corsOptions = {
  origin:
    process.env.NODE_ENV === "development"
      ? ["http://localhost:3000", "http://127.0.0.1:3000"] // Development origins
      : "https://erth.network", // Production origin
  methods: ["GET", "POST"],
  credentials: true,
  optionsSuccessStatus: 204,
};

// Enable CORS for specific endpoints that need it for testing
app.use("/api/analytics", cors(corsOptions));
app.use("/api/register", cors(corsOptions));


app.use("/api/cors", (req, res) => {
  req.url = req.url.replace(/^\/api\/cors/, ""); // strip the /api/cors prefix
  proxy.emit("request", req, res);
});

// Initialize analytics
initAnalytics();

// Allow CORS for the analytics endpoint
app.use("/api/analytics", (req, res, next) => {
  // Allow both the production domain and localhost during development
  const allowedOrigins = ["https://erth.network", "http://localhost:3000"];
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

// Simple endpoint for front-end
app.get("/api/analytics", (req, res) => {
  const latest = getLatestData();
  const history = getAllData();
  res.json({ latest, history });
});

// Define contract address and hash for registration

const REGISTRATION_CONTRACT = "secret12q72eas34u8fyg68k6wnerk2nd6l5gaqppld6p";
const REGISTRATION_HASH = "c49ef7e87044048a5beb9b600d9604233a4162caa0a1656baaa23ebfac188f20";

// Utility function to read file contents
function get_value(file) {
  const filePath = path.join(__dirname, file);
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return data.trim(); // Trim to remove any extra whitespace or newlines
  } catch (err) {
    console.error(err);
    return null; // Handle the error as needed
  }
}

// Retrieve secret values from files
const WALLET_KEY = get_value("WALLET_KEY.txt");

// Initialize wallet and Secret Network client
const wallet = new Wallet(WALLET_KEY);
const secretjs = new SecretNetworkClient({
  url: "https://lcd.erth.network",
  chainId: "secret-4",
  wallet: wallet,
  walletAddress: wallet.address,
});

// Function to check wallet balance
async function checkBalance() {
  try {
    const balance = await secretjs.query.bank.balance({
      address: wallet.address,
      denom: "uscrt",
    });
    console.log("Wallet balance:", balance);
  } catch (error) {
    console.error("Error checking balance:", error);
  }
}

checkBalance();

// Function to interact with the smart contract
async function contract_interaction(message_object) {
  try {
    let msg = new MsgExecuteContract({
      sender: secretjs.address,
      contract_address: REGISTRATION_CONTRACT,
      code_hash: REGISTRATION_HASH,
      msg: message_object,
    });

    let resp = await secretjs.tx.broadcast([msg], {
      gasLimit: 1_000_000,
      gasPriceInFeeDenom: 0.1,
      feeDenom: "uscrt",
      broadcastMode: "Sync",
    });

    console.log(resp);
    return resp;
  } catch (error) {
    console.error("RPC error during contract interaction:", error);
    throw new Error("Contract interaction failed due to RPC error");
  }
}

function generateHash(data) {
  return crypto.createHash("sha256").update(JSON.stringify(data)).digest("hex");
}

async function processImagesWithSecretAI(idImage, selfieImage, address) {
  const secretAiLLM = new ChatSecret({
    apiKey: "bWFzdGVyQHNjcnRsYWJzLmNvbTpTZWNyZXROZXR3b3JrTWFzdGVyS2V5X18yMDI1",
    model: "llama3.2-vision", // Vision-capable model
    base_url: SECRET_AI_CONFIG.DEFAULT_LLM_URL,
    temperature: 0,
  });

  const systemPrompt = `
    IMPORTANT: You are a JSON-only responder. Output ONLY a JSON object with no additional text or markers.

    Process the provided ID image and selfie image to create an identity JSON and detect fakes:
    - From the ID image, extract: Country, ID Number, Name, Date of Birth (convert to Unix timestamp in seconds), Document Expiration (convert to Unix timestamp in seconds).
    - From the selfie, verify liveness (e.g., check for natural appearance, not a photo of a photo) and consistency with the ID.
    - Detect fakes: Check for inconsistencies (e.g., mismatched data, blurry text, static selfie, or signs of tampering).

    Expected JSON structure:
    {
      "identity": {
        "country": "string",
        "id_number": "string",
        "name": "string",
        "date_of_birth": number, // Unix timestamp in seconds
        "document_expiration": number, // Unix timestamp in seconds
      },
      "is_fake": boolean,
      "fake_reason": "string or null",
    }
  `;

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: "Analyze the following images to extract identity data and detect fakes:",
      images: [idImage, selfieImage], // Base64-encoded images
    },
  ];

  try {
    const response = await secretAiLLM.chat(messages);
    const result = JSON.parse(response.message?.content || response.content);

    if (!result.identity || typeof result.is_fake === "undefined" || !result.hash) {
      throw new Error("Invalid response structure from SecretAI Vision");
    }

    return result;
  } catch (error) {
    console.error("SecretAI Vision error:", error);
    return {
      identity: { country: "", id_number: "", name: "", date_of_birth: 0, document_expiration: 0, address },
      is_fake: true,
      fake_reason: "Failed to process images: " + error.message,
      hash: generateHash({ country: "", id_number: "", name: "", date_of_birth: 0, document_expiration: 0, address }),
    };
  }
}

app.post("/api/register", async (req, res) => {
  const { address, idImage, selfieImage } = req.body;
  if (!address || !idImage || !selfieImage) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const { identity, is_fake, fake_reason, hash } = await processImagesWithSecretAI(idImage, selfieImage, address);

    if (is_fake) {
      return res.status(400).json({ error: "Fake identity detected", reason: fake_reason });
    }

    const message_object = {
      register: {
        user_object: identity,
        hash,
      },
    };

    res.json({ success: true, identity, is_fake, fake_reason, hash });

    // const resp = await contract_interaction(message_object);
    // if (resp.code === 0) {
    //   res.json({ success: true, hash });
    // } else {
    //   throw new Error("Contract interaction failed with code: " + resp.code);
    // }
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed: " + error.message });
  }
});

// Start the server
let server = require("http").Server(app);

server.listen(WEBHOOK_PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${WEBHOOK_PORT}`);
});
