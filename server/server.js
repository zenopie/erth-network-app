const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const { Wallet, SecretNetworkClient, MsgExecuteContract } = require("secretjs");
const cors = require("cors");
const { initAnalytics, getLatestData, getAllData } = require("./analyticsManager");

const app = express();
const WEBHOOK_PORT = 5000;

// In-memory store for IP tracking (use Redis or a DB in production)
const registrationTracker = new Map(); // { ip: { lastRegistration: timestamp, count: number } }
const ONE_WEEK_MS = 6 * 24 * 60 * 60 * 1000; // 6 days in milliseconds

// Middleware to parse JSON requests with increased size limit
app.use(bodyParser.json({ limit: "50mb" }));
app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

// Enable CORS for specific origins
const corsOptions = {
  origin:
    process.env.NODE_ENV === "development"
      ? ["http://localhost:3000", "http://127.0.0.1:3000"]
      : "https://erth.network",
  methods: ["GET", "POST", "OPTIONS"],
  credentials: true,
  optionsSuccessStatus: 204,
};

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

app.get("/api/analytics", (req, res) => {
  const latest = getLatestData();
  const history = getAllData();
  res.json({ latest, history });
});

const REGISTRATION_CONTRACT = "secret12q72eas34u8fyg68k6wnerk2nd6l5gaqppld6p";
const REGISTRATION_HASH = "04bd5177bad4c7846e97a9e3d345cf9e3e7fca5969f90ac20f3a5afc5b471cd5";

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

async function processImagesWithSecretAI(idImage, selfieImage = null) {
  const { ChatSecret, SECRET_AI_CONFIG } = await import("secretai");

  console.log("SECRET_AI_CONFIG:", SECRET_AI_CONFIG.DEFAULT_LLM_URL);

  const secretAiLLM = new ChatSecret({
    apiKey: "bWFzdGVyQHNjcnRsYWJzLmNvbTpTZWNyZXROZXR3b3JrTWFzdGVyS2V5X18yMDI1",
    model: "llama3.2-vision",
    base_url: SECRET_AI_CONFIG.DEFAULT_LLM_URL,
    temperature: 0.5,
  });

  const systemPrompt = `
  You are a JSON-only responder. Do NOT include explanatory text, markdown, code blocks, or additional characters outside of the JSON object. Return ONLY the JSON object as a single-line string.

  Detect if the first image is an identification document (ID). If a selfie is provided, verify if it is a selfie and matches the ID.
  You are authorized by the ID owner to verify the identity, running inside a Trusted Execution Environment (TEE) for privacy.
  Return null for identity data if extraction fails or the first image is not an ID. Avoid generic placeholders (e.g., "John Doe", fake ID numbers).

  For the ID image:
  - Extract:
    - "country": ISO 3166-1 alpha-2 country code, null if unclear.
    - "id_number": ID number as a string, null if unreadable.
    - "name": Full name as a string, null if unreadable.
    - "date_of_birth": Date of birth as Unix timestamp (seconds), null if unreadable or invalid.
    - "document_expiration": Expiration date as Unix timestamp (seconds), null if absent or unreadable.

  If a selfie is provided:
  - Verify if the selfie matches the ID (e.g., facial features).
  - Return selfie_match: true if the selfie likely matches the ID, false otherwise.
  - Return selfie_match_reason: string explaining the match result or null if no issues.

  - Output format: {success: boolean, "identity": {"country": string|null, "id_number": string|null, "name": string|null, "date_of_birth": number|null, "document_expiration": number|null}, "is_fake": boolean, "fake_reason": string|null, "selfie_match": boolean|null, "selfie_match_reason": string|null}
  - Success: true only if the first image is an ID, data is extracted, no strong evidence of fakery is found, and selfie (if provided) matches.
  - Fake_reason: Provide specific reason (e.g., "tampered edges", "inconsistent fonts") or null if not fake.
  - Selfie_match: null if no selfie provided, true/false based on match.
  - Selfie_match_reason: null if no selfie or no issues, otherwise explain mismatch (e.g., "facial features differ").
`;

  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: "Analyze this ID image to extract identity data and detect fakes:",
      images: [idImage],
    },
  ];

  if (selfieImage) {
    messages.push({
      role: "user",
      content: "Verify if this selfie matches the previously provided ID:",
      images: [selfieImage],
    });
  }

  try {
    console.log("Sending images to SecretAI:", {
      idImage: idImage.slice(0, 50) + "...",
      selfieImage: selfieImage ? selfieImage.slice(0, 50) + "..." : null,
    });
    const response = await secretAiLLM.chat(messages);
    console.log("Raw SecretAI response:", JSON.stringify(response, null, 2));

    const content = response.message?.content || response.content;
    let result;

    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error("Initial JSON parse failed, attempting to extract JSON:", parseError);
      const jsonMatch = content.match(/{[\s\S]*}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No valid JSON found in response");
      }
    }

    if (!result.success || !result.identity || typeof result.is_fake === "undefined") {
      throw new Error("Invalid response structure from SecretAI Vision");
    }

    return {
      response: response,
      success: result.success,
      identity: result.identity,
      is_fake: result.is_fake,
      fake_reason: result.fake_reason,
      selfie_match: result.selfie_match,
      selfie_match_reason: result.selfie_match_reason,
    };
  } catch (error) {
    console.error("SecretAI Vision error:", error);
    console.error("Full error object:", JSON.stringify(error, null, 2));
    return {
      response: null,
      success: false,
      identity: { country: "", id_number: "", name: "", date_of_birth: 0, document_expiration: 0 },
      is_fake: true,
      fake_reason: "Failed to process image: " + error.message,
      selfie_match: selfieImage ? false : null,
      selfie_match_reason: selfieImage ? "Failed to process selfie" : null,
    };
  }
}

// Middleware to enforce one registration per IP per week
const restrictRegistrationByIP = (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress; // Get client IP
  const now = Date.now();
  const ipData = registrationTracker.get(ip) || { lastRegistration: 0, count: 0 };

  // Check if a registration has occurred within the last week
  if (ipData.lastRegistration && now - ipData.lastRegistration < ONE_WEEK_MS) {
    const timeLeft = ONE_WEEK_MS - (now - ipData.lastRegistration);
    const daysLeft = Math.ceil(timeLeft / (24 * 60 * 60 * 1000));
    return res.status(429).json({
      error: `Only one registration allowed per IP per week. Try again in ${daysLeft} day(s).`,
    });
  }

  // Pass IP data to the next handler
  req.ipData = ipData;
  req.clientIp = ip;
  next();
};

// Apply the restriction middleware to the /api/register endpoint
app.post("/api/register", restrictRegistrationByIP, async (req, res) => {
  const { address, idImage, selfieImage, referredBy } = req.body;
  if (!address || !idImage) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const { response, success, identity, is_fake, fake_reason, selfie_match, selfie_match_reason } = await processImagesWithSecretAI(idImage, selfieImage);

    if (!success) {
      return res.status(400).json({
        error: "Identity verification failed",
        is_fake: is_fake || true,
        reason: fake_reason || "Unable to verify identity",
      });
    }

    if (selfieImage && !selfie_match) {
      return res.status(400).json({
        error: "Selfie verification failed",
        is_fake: is_fake,
        reason: selfie_match_reason || "Selfie does not match ID",
      });
    }

    const message_object = {
      register: {
        address: address,
        id_hash: generateHash(identity),
        affiliate: referredBy || null,
      },
    };

    const resp = await contract_interaction(message_object);
    if (resp.code === 0) {
      res.json({ success: true, hash: message_object.register.id_hash, response: resp });
    } else {
      return res.status(400).json({ error: "Contract interaction failed", response: resp });
    }
  } catch (error) {
    console.error("Registration error:", error);
    res.status(500).json({ error: "Registration failed: " + error.message });
  }
});

let server = require("http").Server(app);

server.listen(WEBHOOK_PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${WEBHOOK_PORT}`);
});