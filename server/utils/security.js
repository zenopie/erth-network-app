const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const { get_value } = require("./contract");

// Generate HMAC signature for webhook validation
function generateSignature(payload, secret) {
  return crypto.createHmac("sha256", secret).update(JSON.stringify(payload)).digest("hex");
}

// Validate webhook signature
function isSignatureValid(data) {
  const API_SECRET = get_value("API_SECRET.txt");
  if (!API_SECRET) {
    console.error("API_SECRET.txt not found or empty");
    return false;
  }

  const { payload, signature } = data;
  if (!payload || !signature) {
    console.error("Missing payload or signature");
    return false;
  }

  const computedSignature = generateSignature(payload, API_SECRET);
  return crypto.timingSafeEqual(Buffer.from(computedSignature), Buffer.from(signature));
}

// Save pending verifications to file
function save_pending(array, file) {
  try {
    const filePath = path.join(__dirname, "..", file);
    fs.writeFileSync(filePath, JSON.stringify(array));
    return true;
  } catch (error) {
    console.error(`Error writing to ${file}:`, error);
    return false;
  }
}

// Helper function to convert date string to seconds
function convertToSecondsString(dateString) {
  const date = new Date(dateString);
  return Math.floor(date.getTime() / 1000).toString();
}

module.exports = {
  generateSignature,
  isSignatureValid,
  save_pending,
  convertToSecondsString,
};
