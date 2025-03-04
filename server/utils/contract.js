const { Wallet, SecretNetworkClient, MsgExecuteContract } = require("secretjs");
const fs = require("fs");
const path = require("path");

// Load wallet key from file
function get_value(file) {
  const filePath = path.join(__dirname, "..", file);
  try {
    return fs.readFileSync(filePath, "utf8").trim();
  } catch (error) {
    console.error(`Error reading ${file}:`, error);
    return null;
  }
}

const WALLET_KEY = get_value("WALLET_KEY.txt");

async function checkBalance() {
  try {
    const wallet = new Wallet(WALLET_KEY);
    const client = new SecretNetworkClient({
      url: "https://lcd.secret.express",
      chainId: "secret-4",
      wallet: wallet,
      walletAddress: wallet.address,
    });

    const balance = await client.query.bank.balance({
      address: wallet.address,
      denom: "uscrt",
    });

    return balance;
  } catch (error) {
    console.error("Error checking balance:", error);
    return null;
  }
}

async function contract_interaction(message_object) {
  try {
    const wallet = new Wallet(WALLET_KEY);
    const client = new SecretNetworkClient({
      url: "https://lcd.secret.express",
      chainId: "secret-4",
      wallet: wallet,
      walletAddress: wallet.address,
    });

    const tx = await client.tx.broadcast([message_object], {
      gasLimit: 200000,
      gasPriceInFeeDenom: 0.1,
      feeDenom: "uscrt",
    });

    return parseResultFromLogs(tx.jsonLog);
  } catch (error) {
    console.error("Error with contract interaction:", error);
    return { error: error.message };
  }
}

function parseResultFromLogs(logs) {
  try {
    if (!logs || !logs[0] || !logs[0].events) {
      return { error: "No logs found" };
    }

    for (const event of logs[0].events) {
      if (event.type === "wasm") {
        for (const attribute of event.attributes) {
          if (attribute.key === "result") {
            return JSON.parse(attribute.value);
          }
        }
      }
    }

    return { error: "Result not found in logs" };
  } catch (error) {
    console.error("Error parsing logs:", error);
    return { error: "Failed to parse logs: " + error.message };
  }
}

module.exports = {
  get_value,
  checkBalance,
  contract_interaction,
  parseResultFromLogs,
};
