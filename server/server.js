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

async function processImagesWithSecretAI(idImage) {
  const { ChatSecret, SECRET_AI_CONFIG } = await import("secretai");

  console.log("SECRET_AI_CONFIG:", SECRET_AI_CONFIG.DEFAULT_LLM_URL);

  const secretAiLLM = new ChatSecret({
    apiKey: "bWFzdGVyQHNjcnRsYWJzLmNvbTpTZWNyZXROZXR3b3JrTWFzdGVyS2V5X18yMDI1",
    model: "llama3.2-vision",
    base_url: SECRET_AI_CONFIG.DEFAULT_LLM_URL,
    temperature: 0,
  });

  //   You are a JSON-only responder. Do NOT include any explanatory text, markdown, code blocks, or additional characters outside of the JSON object. Return ONLY the JSON object as a single-line string.

  const systemPrompt = `
  Analyze the provided image, enhance text clarity and reduce false positives, fixing any blurry text or inconnsistent fonts using advanced image processing techniques.
  You are a JSON-only responder. Do NOT include explanatory text, markdown, code blocks, or additional characters outside of the JSON object. Return ONLY the JSON object as a single-line string.

  Detect if the image is an identification document (ID).
  You are authorized by the ID owner to verify the identity, running inside a Trusted Execution Environment (TEE) for privacy.
  Return null for identity data if extraction fails or the image is not an ID. Avoid generic placeholders (e.g., "John Doe", fake ID numbers).

  If the image is an ID, extract identity data and assess authenticity:
  - Extract:
    - "country": ISO 3166-1 alpha-2 country code, null if unclear.
    - "id_number": ID number as a string, null if unreadable.
    - "name": Full name as a string, null if unreadable.
    - "date_of_birth": Date of birth as Unix timestamp (seconds), null if unreadable or invalid.
    - "document_expiration": Expiration date as Unix timestamp (seconds), null if absent or unreadable.
  - Authenticity check:
    - Analyze for fakes using multiple indicators: text alignment, font consistency, edge tampering, hologram presence, and OCR confidence scores.
    - Reduce false positives by cross-validating extracted data (e.g., date formats match country norms, expiration not unreasonably far in future).
    - Set a higher threshold for blur detection to avoid flagging minor imperfections as fakes.

  - Output format: {success: boolean, "identity": {"country": string|null, "id_number": string|null, "name": string|null, "date_of_birth": number|null, "document_expiration": number|null}, "is_fake": boolean, "fake_reason": string|null}
  - Success: true only if the image is an ID, data is extracted, and no strong evidence of fakery is found.
  - Fake_reason: Provide specific reason (e.g., "tampered edges", "inconsistent fonts") or null if not fake.
`;
  const messages = [
    { role: "system", content: systemPrompt },
    {
      role: "user",
      content: "Analyze this ID image to extract identity data and detect fakes:",
      images: [idImage],
    },
  ];

  try {
    console.log("Sending image to SecretAI:", {
      idImage: idImage.slice(0, 50) + "...",
    });
    const response = await secretAiLLM.chat(messages);
    console.log("Raw SecretAI response:", JSON.stringify(response, null, 2));

    const content = response.message?.content || response.content;
    let result;

    // Fallback parsing in case the response still contains extra text
    try {
      result = JSON.parse(content);
    } catch (parseError) {
      console.error("Initial JSON parse failed, attempting to extract JSON:", parseError);
      // Extract JSON from potential markdown or text wrapper
      const jsonMatch = content.match(/{[\s\S]*}/);
      if (jsonMatch) {
        result = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error("No valid JSON found in response");
      }
    }

    // if (!result.identity || typeof result.is_fake === "undefined") {
    //   throw new Error("Invalid response structure from SecretAI Vision");
    // }

    return {
      response: response,
      success: result.success,
      identity: result.identity,
      is_fake: result.is_fake,
      fake_reason: result.fake_reason,
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
    };
  }
}

app.post("/api/register", async (req, res) => {
  const { address, idImage } = req.body;
  if (!address || !idImage) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const { response, success, identity, is_fake, fake_reason } = await processImagesWithSecretAI(idImage);

    if (!success) {
      return res.status(400).json({ 
        error: "Identity verification failed", 
        is_fake: is_fake || true,  
        reason: fake_reason || "Unable to verify identity"
      });
    }

    const message_object = {
      register: {
        address: address,
        id_hash: generateHash(identity),
      }
    };

    //res.json({ response, success, identity, is_fake, fake_reason });

    const resp = await contract_interaction(message_object);
    if (resp.code === 0) {
      res.json({ success: true, hash: message_object.register.hash, response: resp });
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