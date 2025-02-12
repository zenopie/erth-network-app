const express = require("express");
const crypto = require("crypto");
const bodyParser = require("body-parser");
const fs = require("fs");
const path = require("path");
const { Wallet, SecretNetworkClient, MsgExecuteContract } = require("secretjs");
const corsProxy = require("cors-anywhere");

const app = express();
const WEBHOOK_PORT = 5000; // Port for HTTPS

const proxy = corsProxy.createServer({
  originWhitelist: [], // allow all origins
  removeHeaders: ["cookie", "cookie2"],
  handleInitialRequest: (_req, res, location) => {
    // Block if target hostname equals your server's hostname
    if (location && location.hostname === "erth.network") {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end("Self referencing request blocked");
      return true;
    }
  }
});

app.use("/api/cors", (req, res) => {
  req.url = req.url.replace(/^\/api\/cors/, ""); // strip the /api/cors prefix
  proxy.emit("request", req, res);
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
const API_SECRET = get_value("API_SECRET.txt");
const WALLET_KEY = get_value("WALLET_KEY.txt");



// Initialize wallet and Secret Network client
const wallet = new Wallet(WALLET_KEY);
const secretjs = new SecretNetworkClient({
  url: "https://lcd.archive.scrt.marionode.com",
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

// Retrieve and parse the list of pending verifications
let pending_verifications = JSON.parse(get_value("PENDING_VERIFS.txt"));

// Utility function to save the pending verifications array to a file
function save_pending(array, file) {
  const filePath = path.join(__dirname, file);
  const arrayAsString = JSON.stringify(array, null, 2);
  fs.writeFile(filePath, arrayAsString, "utf8", (err) => {
    if (err) {
      console.error(`Error writing file: ${err}`);
      return;
    }
    console.log("Array written to file successfully.");
  });
}

// Middleware to parse JSON requests
app.use(bodyParser.json());
// Serve static files from the 'public' directory

// Function to generate HMAC signature
function generateSignature(payload, secret) {
  if (payload.constructor === Object) {
    payload = JSON.stringify(payload);
  }

  if (payload.constructor !== Buffer) {
    payload = Buffer.from(payload, "utf8");
  }

  const signature = crypto.createHmac("sha256", secret);
  signature.update(payload);
  return signature.digest("hex");
}

// Function to validate HMAC signature
function isSignatureValid(data) {
  const { signature, secret } = data;
  let { payload } = data;

  if (data.payload.constructor === Object) {
    payload = JSON.stringify(data.payload);
  }
  if (payload.constructor !== Buffer) {
    payload = Buffer.from(payload, "utf8");
  }
  const hash = crypto.createHmac("sha256", secret);
  hash.update(payload);
  const digest = hash.digest("hex");
  console.log("Generated hash:", digest);
  console.log("Provided signature:", signature.toLowerCase());
  return digest === signature.toLowerCase();
}

// Function to parse the result attribute from the logs
function parseResultFromLogs(logs) {
  for (const log of logs) {
    for (const event of log.events) {
      if (event.type === "wasm") {
        for (const attribute of event.attributes) {
          if (attribute.key === "result" && attribute.value === "registered") {
            return true;
          }
        }
      }
    }
  }
  return false;
}

function convertToSecondsString(dateString) {
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) {
      return null; // Return null if the date is invalid
    }
    const seconds = Math.floor(date.getTime() / 1000); // Convert milliseconds to seconds
    return seconds.toString();
  } catch (error) {
    return null; // Return null if any other error occurs
  }
}

// Webhook endpoint for Veriff decisions
app.post("/api/veriff/decisions/", async (req, res) => {
  const signature = req.get("x-hmac-signature");
  const payload = req.body;
  const secret = API_SECRET;

  console.log("Received a decisions webhook");
  const isValid = isSignatureValid({ signature, secret, payload });
  console.log("Validated signature:", isValid);
  console.log("Payload", JSON.stringify(req.body, null, 4));
  res.json({ status: "success" });

  if (isValid) {
    const verification = req.body.data.verification;
    if (verification.decision === "approved" && verification.document && verification.person) {
      let document_expiration = convertToSecondsString(verification.document.validUntil.value);
      let date_of_birth = convertToSecondsString(verification.person.dateOfBirth.value);
      const userObject = {
        country: verification.document.country ? verification.document.country.value : "",
        address: req.body.vendorData ? req.body.vendorData : "",
        first_name: verification.person.firstName ? verification.person.firstName.value : "",
        last_name: verification.person.lastName ? verification.person.lastName.value : "",
        date_of_birth: date_of_birth ? parseInt(date_of_birth) : 0,
        document_number: verification.document.number ? verification.document.number.value : "",
        id_type: verification.document.type ? verification.document.type.value : "",
        document_expiration: document_expiration ? parseInt(document_expiration) : 0,
      };      
      console.log(userObject);
      const message_object = {
        register: {
          user_object: userObject,
        },
      };

      try {
        const resp = await contract_interaction(message_object);

        // Parse the logs for the 'result' attribute
        if (parseResultFromLogs(resp.logs)) {
          let find_address = pending_verifications.indexOf(req.body.vendorData);
          if (find_address != -1) {
            pending_verifications.splice(find_address, 1);
            save_pending(pending_verifications, "PENDING_VERIFS.txt");
            console.log("Spliced address", pending_verifications);
          } else {
            console.log("Error finding address in pending verifications");
          }
        } else {
          console.log("Contract interaction failed or document already registered", resp);
        }
      } catch (error) {
        console.error("Contract interaction error:", error);
      }
    }
  }
});

// Webhook endpoint for Veriff events
app.post("/api/veriff/events/", (req, res) => {
  const signature = req.get("x-hmac-signature");
  const payload = req.body;
  const secret = API_SECRET;
  const isValid = isSignatureValid({ signature, secret, payload });

  console.log("Received an events webhook");
  console.log("Validated signature:", isValid);
  console.log("Payload", JSON.stringify(req.body, null, 4));
  res.json({ status: "success" });

  if (isValid && req.body.action === "submitted") {
    pending_verifications.push(req.body.vendorData);
    save_pending(pending_verifications, "PENDING_VERIFS.txt");
    console.log("Pushed address", pending_verifications);
  }
});

// Endpoint to check if an address has pending verifications
app.get("/api/pending/:address", (req, res) => {
  const address = req.params.address;
  const pending = pending_verifications.includes(address);
  res.json({ pending: pending });
});



// Start the server
let server = require("http").Server(app);

server.listen(WEBHOOK_PORT, "0.0.0.0", () => {
  console.log(`Server is running on port ${WEBHOOK_PORT}`);
});
