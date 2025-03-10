// reset-analytics.js
// Script to reset analytics data and initialize with a fresh data point

const { initAnalytics } = require("./analyticsManager");

console.log("Resetting analytics data...");
// Call initAnalytics with resetData=true to reset and initialize with fresh data
initAnalytics(true);
console.log("Analytics data has been reset and initialized with a new data point.");
console.log("You can safely exit this script after seeing the confirmation logs from analyticsManager.");
