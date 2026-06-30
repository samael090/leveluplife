/* ==========================================================================
   LevelUp Life - Reminders Diagnostics Utility Script
   Use this to test Nodemailer/Twilio email/SMS alerts directly from CLI
   Run command: node backend/test-reminder.js
   ========================================================================== */

require('dotenv').config({ path: __dirname + '/.env' });
const { checkAndSendReminders } = require('./services/reminder');

console.log("=================================================");
console.log("LevelUp Life: Reminders Diagnostics Triggered.");
console.log("Reading environment parameters from backend/.env...");
console.log("SMTP User:", process.env.SMTP_USER || "Not Configured (Will mock email logs)");
console.log("Twilio Account SID:", process.env.TWILIO_ACCOUNT_SID ? "Configured" : "Not Configured (Will mock SMS logs)");
console.log("=================================================");

async function testScan() {
    try {
        console.log("Running checkAndSendReminders scan...");
        await checkAndSendReminders();
        console.log("Scan finished. Check logs above to verify alerts dispatch.");
        process.exit(0);
    } catch (err) {
        console.error("Test failed with error:", err);
        process.exit(1);
    }
}

testScan();
