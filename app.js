const express = require('express');
const crypto = require("crypto");
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { Wallet, SecretNetworkClient, MsgExecuteContract } = require("secretjs");

const app = express();
const WEBHOOK_PORT = 4000; // Port for HTTPS

// Define contract address and hash for registration
const REGISTRATION_CONTRACT = "secret1vl3auz6w3lxaq56uf06d442edm6xxv2qvhwcdq";
const REGISTRATION_HASH = "f798c2abe39a705e21bfdfa4aef32dc9509dd4fc36f6a92c0525e1b3fcb9e838";

// Utility function to read file contents
function get_value(file) {
  const filePath = path.join(__dirname, file);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
    return data;
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
  url: "https://api.pulsar.scrttestnet.com",
  chainId: "pulsar-3",
  wallet: wallet,
  walletAddress: wallet.address,
});

// Function to interact with the smart contract
async function contract_interaction(message_object) {
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
  });
  console.log(resp);
}

// Retrieve and parse the list of pending verifications
let pending_verifications = JSON.parse(get_value("PENDING_VERIFS.txt"));

// Utility function to save the pending verifications array to a file
function save_pending(array, file) {
  const filePath = path.join(__dirname, file);
  const arrayAsString = JSON.stringify(array, null, 2);
  fs.writeFile(filePath, arrayAsString, 'utf8', (err) => {
    if (err) {
      console.error(`Error writing file: ${err}`);
      return;
    }
    console.log('Array written to file successfully.');
  });
}

// Middleware to parse JSON requests
app.use(bodyParser.json());
// Serve static files from the 'public' directory
app.use(express.static('public'));

// Function to validate HMAC signature
function isSignatureValid(data) {
  const { signature, secret } = data;
  let { payload } = data;

  if (payload.constructor === Object) {
    payload = JSON.stringify(payload);
  }
  if (payload.constructor !== Buffer) {
    payload = Buffer.from(payload, "utf8");
  }
  const hash = crypto.createHmac("sha256", secret);
  hash.update(payload);
  const digest = hash.digest("hex");
  return digest === signature.toLowerCase();
}

// Endpoint to check if an address has pending verifications
app.get("/api/pending/:address", (req, res) => {
  const address = req.params.address;
  const pending = pending_verifications.includes(address);
  res.json({ pending: pending });
});

// Webhook endpoint for Veriff decisions
app.post("/api/veriff/decisions/", (req, res) => {
  const signature = req.get("x-hmac-signature");
  const secret = API_SECRET;
  const payload = req.body;

  console.log("Received a decisions webhook");
  const isValid = isSignatureValid({ signature, secret, payload });
  console.log("Validated signature:", isValid);
  console.log("Payload", JSON.stringify(payload, null, 4));
  res.json({ status: "success" });

  let find_address = pending_verifications.indexOf(payload.verification.vendorData);
  if (find_address != -1 && isValid) {
    pending_verifications.splice(find_address, 1);
    save_pending(pending_verifications, "PENDING_VERIFS.txt");
    console.log("Spliced address", pending_verifications);
  } else {
    console.log("Error finding address in pending verifications");
  }

  if (payload.verification.status == "approved" && isValid) {
    const userObject = {
      country: payload.verification.document.country,
      address: payload.verification.vendorData,
      first_name: payload.verification.person.firstName,
      last_name: payload.verification.person.lastName,
      date_of_birth: "test",
      document_number: "test" + Math.ceil(Math.random() * 10000),
      id_type: payload.verification.document.type,
      document_expiration: "test"
    };
    const message_object = {
      register: { user_object: userObject }
    };
    contract_interaction(message_object);
  }
});

// Webhook endpoint for Veriff events
app.post("/api/veriff/events/", (req, res) => {
  const signature = req.get("x-hmac-signature");
  const secret = API_SECRET;
  const payload = req.body;
  const isValid = isSignatureValid({ signature, secret, payload });

  console.log("Received an events webhook");
  console.log("Validated signature:", isValid);
  console.log("Payload", JSON.stringify(payload, null, 4));
  res.json({ status: "success" });

  if (payload.action == "submitted" && isValid) {
    pending_verifications.push(payload.vendorData);
    save_pending(pending_verifications, "PENDING_VERIFS.txt");
    console.log("Pushed address", pending_verifications);
  }
});

// Start the server
let server = require("http").Server(app);
server.listen(WEBHOOK_PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${WEBHOOK_PORT}`);
});
