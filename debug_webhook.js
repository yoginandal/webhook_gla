const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Load environment variables
require("dotenv").config();

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "GLA_leads_123";

async function debugWebhookSetup() {
  console.log("🔍 Facebook Webhook Debug Tool");
  console.log("=".repeat(50));

  // 1. Check environment variables
  console.log("\n📋 Environment Variables:");
  console.log(`✅ VERIFY_TOKEN: ${VERIFY_TOKEN}`);
  console.log(`✅ PAGE_ACCESS_TOKEN: ${PAGE_ACCESS_TOKEN ? "SET" : "MISSING"}`);
  console.log(`✅ PORT: ${process.env.PORT || 3007}`);

  if (!PAGE_ACCESS_TOKEN) {
    console.error("❌ PAGE_ACCESS_TOKEN is missing!");
    return;
  }

  try {
    // 2. Test Facebook Graph API access
    console.log("\n🔗 Testing Facebook Graph API Access:");
    const meResponse = await axios.get(`https://graph.facebook.com/v17.0/me`, {
      params: { access_token: PAGE_ACCESS_TOKEN },
    });
    console.log(`✅ Page ID: ${meResponse.data.id}`);
    console.log(`✅ Page Name: ${meResponse.data.name}`);

    // 3. Check webhook subscriptions
    console.log("\n📡 Checking Webhook Subscriptions:");
    const subscriptionsResponse = await axios.get(
      `https://graph.facebook.com/v17.0/me/subscribed_apps`,
      { params: { access_token: PAGE_ACCESS_TOKEN } }
    );
    console.log(
      `✅ Subscribed Apps: ${subscriptionsResponse.data.data.length}`
    );

    // 4. Check lead forms
    console.log("\n📝 Checking Lead Forms:");
    const formsResponse = await axios.get(
      `https://graph.facebook.com/v17.0/me/leadgen_forms`,
      { params: { access_token: PAGE_ACCESS_TOKEN } }
    );
    console.log(`✅ Lead Forms Found: ${formsResponse.data.data.length}`);

    if (formsResponse.data.data.length > 0) {
      formsResponse.data.data.forEach((form, index) => {
        console.log(`   Form ${index + 1}: ${form.name} (ID: ${form.id})`);
      });
    }

    // 5. Check recent leads
    console.log("\n📊 Checking Recent Leads:");
    const leadsResponse = await axios.get(
      `https://graph.facebook.com/v17.0/me/leads`,
      { params: { access_token: PAGE_ACCESS_TOKEN, limit: 5 } }
    );
    console.log(`✅ Recent Leads: ${leadsResponse.data.data.length}`);

    if (leadsResponse.data.data.length > 0) {
      leadsResponse.data.data.forEach((lead, index) => {
        console.log(
          `   Lead ${index + 1}: ${lead.id} (Created: ${lead.created_time})`
        );
      });
    }

    // 6. Check Instagram Business Account
    console.log("\n📱 Checking Instagram Business Account:");
    try {
      const instagramResponse = await axios.get(
        `https://graph.facebook.com/v17.0/me/accounts`,
        { params: { access_token: PAGE_ACCESS_TOKEN } }
      );

      if (instagramResponse.data.data.length > 0) {
        console.log(
          `✅ Connected Accounts: ${instagramResponse.data.data.length}`
        );
        instagramResponse.data.data.forEach((account, index) => {
          console.log(
            `   Account ${index + 1}: ${account.name} (ID: ${account.id})`
          );
        });
      }
    } catch (error) {
      console.log("⚠️ Could not fetch Instagram accounts");
    }

    // 7. Test webhook endpoint
    console.log("\n🌐 Testing Webhook Endpoint:");
    try {
      const healthResponse = await axios.get(
        `http://localhost:${process.env.PORT || 3007}/health`
      );
      console.log(`✅ Webhook Server Status: ${healthResponse.data.status}`);
    } catch (error) {
      console.error(`❌ Webhook Server Error: ${error.message}`);
    }

    // 8. Check logs directory
    console.log("\n📁 Checking Logs:");
    const logsDir = path.join(__dirname, "logs");
    if (fs.existsSync(logsDir)) {
      const logFiles = fs.readdirSync(logsDir);
      console.log(`✅ Log Files: ${logFiles.length}`);
      logFiles.forEach((file) => {
        const stats = fs.statSync(path.join(logsDir, file));
        console.log(`   ${file}: ${stats.size} bytes, modified ${stats.mtime}`);
      });
    } else {
      console.log("❌ Logs directory not found");
    }

    // 9. Recommendations
    console.log("\n💡 Recommendations:");
    console.log("1. Verify your Facebook App has 'leadgen' permissions");
    console.log(
      "2. Ensure your Instagram Business Account is connected to the Facebook Page"
    );
    console.log("3. Check that lead forms are published and active");
    console.log("4. Verify webhook URL is accessible from Facebook's servers");
    console.log("5. Check Facebook App Review status for leadgen permissions");
  } catch (error) {
    console.error(
      "❌ Error during debugging:",
      error.response?.data || error.message
    );
  }
}

// Run the debug tool
debugWebhookSetup();
