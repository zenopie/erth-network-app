// migrate-analytics.js
// Script to migrate analytics data to new format with one entry per day

const fs = require("fs");
const path = require("path");

// Use the same analytics file path as in the main analyticsManager
const ANALYTICS_FILE = path.join(__dirname, "../data/analytics.json");

console.log("[Migration] Starting analytics data migration...");

// Load existing analytics data
let analyticsHistory = [];
try {
  if (fs.existsSync(ANALYTICS_FILE)) {
    const raw = fs.readFileSync(ANALYTICS_FILE, "utf8");
    analyticsHistory = JSON.parse(raw);
    console.log(`[Migration] Loaded ${analyticsHistory.length} historical data points`);
  } else {
    console.log("[Migration] No existing analytics file found");
    process.exit(0);
  }
} catch (err) {
  console.error("[Migration] Error loading analytics data:", err);
  process.exit(1);
}

// Make a backup of the original data
const BACKUP_FILE = ANALYTICS_FILE + ".backup-" + Date.now();
fs.writeFileSync(BACKUP_FILE, JSON.stringify(analyticsHistory, null, 2), "utf8");
console.log(`[Migration] Backup created at ${BACKUP_FILE}`);

// Group entries by day and keep only one per day
const entriesByDay = new Map();

// Process each entry to normalize timestamps to midnight
analyticsHistory.forEach((entry) => {
  const date = new Date(entry.timestamp);
  // Set time to midnight (00:00:00)
  date.setHours(0, 0, 0, 0);
  const dayTimestamp = date.getTime();

  // Use the normalized timestamp as key
  if (!entriesByDay.has(dayTimestamp) || entry.timestamp > entriesByDay.get(dayTimestamp).originalTimestamp) {
    // Keep the latest entry for each day
    // Store the original timestamp temporarily to determine which is latest
    entry.originalTimestamp = entry.timestamp;
    entry.timestamp = dayTimestamp;
    entriesByDay.set(dayTimestamp, entry);
  }
});

// Convert map back to array and sort by timestamp
const migratedHistory = Array.from(entriesByDay.values()).sort((a, b) => a.timestamp - b.timestamp);

// Remove the temporary property
migratedHistory.forEach((entry) => {
  delete entry.originalTimestamp;
});

console.log(`[Migration] Reduced ${analyticsHistory.length} entries to ${migratedHistory.length} daily entries`);

// Save the migrated data
fs.writeFileSync(ANALYTICS_FILE, JSON.stringify(migratedHistory, null, 2), "utf8");
console.log(`[Migration] Migration complete. Saved to ${ANALYTICS_FILE}`);

console.log("[Migration] Statistics:");
console.log(`- Original entry count: ${analyticsHistory.length}`);
console.log(`- New entry count: ${migratedHistory.length}`);
console.log(`- First entry date: ${new Date(migratedHistory[0].timestamp).toLocaleDateString()}`);
console.log(
  `- Last entry date: ${new Date(migratedHistory[migratedHistory.length - 1].timestamp).toLocaleDateString()}`
);
