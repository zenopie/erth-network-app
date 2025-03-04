const express = require("express");
const { Wallet, MsgExecuteContract } = require("secretjs");
const { contract_interaction, get_value } = require("../utils/contract");
const { isSignatureValid, save_pending, convertToSecondsString } = require("../utils/security");
const { getLatestData, getAllData } = require("../analyticsManager");

const router = express.Router();
const WALLET_KEY = get_value("WALLET_KEY.txt");

// Save conversation API
router.post("/save-conversation", async (req, res) => {
  console.log("/api/save-conversation");
  // Check if req.body exists
  if (!req.body) {
    console.log("req body missing");
    return res.status(400).json({ error: "Request body is missing" });
  }

  const { user, conversation } = req.body;
  if (!user || !conversation || !conversation.length) {
    console.log("invalid request data");
    console.log(req.body);
    return res.status(400).json({ error: "Invalid request data" });
  }

  try {
    // Create a new SecretNetworkClient for Pulsar-3 (testnet)
    const testnetWallet = new Wallet(WALLET_KEY); // Use same wallet but on testnet
    const testnetClient = new SecretNetworkClient({
      url: "https://pulsar.lcd.secretnodes.com",
      chainId: "pulsar-3",
      wallet: testnetWallet,
      walletAddress: testnetWallet.address,
    });

    const msg = new MsgExecuteContract({
      sender: testnetWallet.address,
      contract_address: "secret1v47zuu6mnq9xzcps4fz7pnpr23d2sczmft26du", // Testnet storage contract
      code_hash: "3545985756548d7d9b85a7a609040fd41a2a0eeba03f81fa166a8063569b01fd", // Testnet contract hash
      msg: { save_conversation: { conversation } },
    });

    const tx = await testnetClient.tx.broadcast([msg], {
      gasLimit: 200000,
      gasPriceInFeeDenom: 0.1,
      feeDenom: "uscrt",
    });

    return res.json({
      success: true,
      message: "Conversation saved successfully",
      txhash: tx.transactionHash,
    });
  } catch (error) {
    console.error("Error saving conversation:", error);
    res.status(500).json({ error: error.message });
  }
});

// Veriff webhook API
router.post("/veriff-webhook", async (req, res) => {
  console.log("/api/veriff-webhook");
  if (!isSignatureValid(req.body)) {
    console.error("Invalid signature in webhook");
    return res.status(401).json({ error: "Invalid signature" });
  }

  const { payload } = req.body;
  console.log("Verified webhook payload:", payload);

  try {
    // Handle pending verifications
    const PENDING_FILE = "PENDING_VERIFS.txt";
    let pending_verifs = [];
    try {
      const pendingContent = get_value(PENDING_FILE);
      if (pendingContent) {
        pending_verifs = JSON.parse(pendingContent);
      }
    } catch (error) {
      console.error("Error parsing pending verifications:", error);
    }

    // Add verification to pending list if verification was successful
    if (payload.verification && payload.verification.status === "approved") {
      const verificationData = {
        submitted_at: convertToSecondsString(payload.verification.submittedAt),
        accepted_at: convertToSecondsString(payload.verification.acceptedAt),
        address: payload.verification.vendorData,
      };

      pending_verifs.push(verificationData);
      save_pending(pending_verifs, PENDING_FILE);
    }

    return res.status(200).json({ success: true });
  } catch (error) {
    console.error("Error processing webhook:", error);
    return res.status(500).json({ error: error.message });
  }
});

// Analytics API endpoints
router.get("/latest-analytics", (req, res) => {
  try {
    const data = getLatestData();
    return res.json(data);
  } catch (error) {
    console.error("Error fetching latest analytics:", error);
    return res.status(500).json({ error: error.message });
  }
});

router.get("/all-analytics", (req, res) => {
  try {
    const data = getAllData();
    return res.json(data);
  } catch (error) {
    console.error("Error fetching all analytics:", error);
    return res.status(500).json({ error: error.message });
  }
});

module.exports = router;
