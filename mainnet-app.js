const express = require('express');
const crypto = require("crypto");
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const { Wallet, SecretNetworkClient, MsgExecuteContract } = require("secretjs");

const app = express();
const WEBHOOK_PORT = 3000; // Port for HTTPS

// Define contract address and hash for registration
const REGISTRATION_CONTRACT = "secret1vl3auz6w3lxaq56uf06d442edm6xxv2qvhwcdq";
const REGISTRATION_HASH = "f798c2abe39a705e21bfdfa4aef32dc9509dd4fc36f6a92c0525e1b3fcb9e838";

// Utility function to read file contents
function get_value(file) {
  const filePath = path.join(__dirname, file);
  try {
    const data = fs.readFileSync(filePath, 'utf8');
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
  url: "https://lcd.mainnet.secretsaturn.net",
  chainId: "secret-4",
  wallet: wallet,
  walletAddress: wallet.address,
});

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
      const userObject = {
        country: verification.document.country ? verification.document.country.value : null,
        address: req.body.vendorData,
        first_name: verification.person.firstName ? verification.person.firstName.value : null,
        last_name: verification.person.lastName ? verification.person.lastName.value : null,
        date_of_birth: verification.person.dateOfBirth ? verification.person.dateOfBirth.value : null,
        document_number: verification.document.number ? verification.document.number.value : null,
        id_type: verification.document.type ? verification.document.type.value : null,
        document_expiration: verification.document.validUntil ? verification.document.validUntil.value : null,
      };
      console.log(userObject);
      const message_object = {
        register: { user_object: userObject }
      };

      try {
        const resp = await contract_interaction(message_object);

        // Check the logs for the 'result' attribute
        const resultAttribute = resp.raw_log.match(/"result":"([^"]+)"/);

        if (resultAttribute && resultAttribute[1] === "registered") {
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
server.listen(WEBHOOK_PORT, '0.0.0.0', () => {
  console.log(`Server is running on port ${WEBHOOK_PORT}`);
});
