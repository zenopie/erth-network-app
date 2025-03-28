const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const { Wallet, SecretNetworkClient, MsgExecuteContract } = require("secretjs");
import { ChatSecret, SECRET_AI_CONFIG } from "secretai";
const cors = require("cors");
const { initAnalytics, getLatestData, getAllData } = require("./analyticsManager");

const app = express();
const WEBHOOK_PORT = 5000;

// Middleware to parse JSON requests with increased size limit
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true })); // Add this for completeness

// Enable CORS for all routes or specific origins
const corsOptions = {
  origin:
    process.env.NODE_ENV === "development"
      ? ["http://localhost:3000", "http://127.0.0.1:3000"]
      : "https://erth.network",
  methods: ["GET", "POST"],
  credentials: true,
  optionsSuccessStatus: 204,
};

// Enable CORS for specific endpoints
app.use("/api/analytics", cors(corsOptions));
app.use("/api/register", cors(corsOptions));

// Log incoming requests for debugging
app.use("/api/register", (req, res, next) => {
  console.log("Incoming /api/register request");
  console.log("Request body size:", JSON.stringify(req.body).length / 1024 / 1024, "MB");
  next();
});

// Initialize analytics
initAnalytics();

app.use("/api/analytics", (req, res, next) => {
  const allowedOrigins = ["https://erth.network", "http://localhost:3000"];
  const origin = req.headers.origin;
  if (allowedOrigins.includes(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }
  res.setHeader("Access-Control-Allow-Methods", "GET");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  next();
});

app.get("/api/analytics", (req, res) => {
  const latest = getLatestData();
  const history = getAllData();
  res.json({ latest, history });
});

const REGISTRATION_CONTRACT = "secret12q72eas34u8fyg68k6wnerk2nd6l5gaqppld6p";
const REGISTRATION_HASH = "c49ef7e87044048a5beb9b600d9604233a4162caa0a1656baaa23ebfac188f20";

function get_value(file) {
  const filePath = path.join(__dirname, file);
  try {
    const data = fs.readFileSync(filePath, "utf8");
    return data.trim();
  } catch (err) {
    console.error(err);
    return null;
  }
}

const WALLET_KEY = get_value("WALLET_KEY.txt");

const wallet = new Wallet(WALLET_KEY);
const secretjs = new SecretNetworkClient({
  url: "https://lcd.erth.network",
  chainId: "secret-4",
  wallet: wallet,
  walletAddress: wallet.address,
});

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
    model: "llama3.2-vision",
    base_url: SECRET_AI_CONFIG.DEFAULT_BASE_URL,
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
        "date_of_birth": number,
        "document_expiration": number
      },
      "is_fake": boolean,
      "fake_reason": "string or null"
    }
  `;

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: "Analyze the following images to extract identity data and detect fakes:",
      images: [idImage, selfieImage],
    },
  ];

  try {
    const response = await secretAiLLM.chat(messages);
    const result = JSON.parse(response.message?.content || response.content);

    if (!result.identity || typeof result.is_fake === "undefined") {
      throw new Error("Invalid response structure from SecretAI Vision");
    }

    return { ...result, hash: generateHash(result.identity) }; // Add hash here since SecretAI doesn't return it
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
    // Uncomment when ready to interact with contract
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

let server = require("http").Server(app);

server.listen(WEBHOOK_PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${WEBHOOK_PORT}`);
});