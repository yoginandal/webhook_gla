const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Load environment variables
require("dotenv").config();

const app = express();
// Prefer modern express JSON parser
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Optional: capture Facebook X-Hub-Signature for future validation/debugging
app.use((req, res, next) => {
  if (req.headers["x-hub-signature"]) {
    logSuccess(`🛡️ Signature: ${req.headers["x-hub-signature"]}`);
  }
  next();
});

// ✅ Environment variables with fallbacks
const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "GLA_leads_123";
const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;
const PORT = process.env.PORT || 3007;
const CRM_API_URL =
  process.env.CRM_API_URL ||
  "https://glawebapi.glaonline.com/api/ChannelPartner/CPRegistrationOnline_API";
const DEFAULT_DOB = process.env.DEFAULT_DOB || "12/7/2000";
const DEFAULT_PROGRAM_CODE = process.env.DEFAULT_PROGRAM_CODE || "OGLAMBA201";
const DEFAULT_SOURCE = process.env.DEFAULT_SOURCE || "Stealth";
const UTM_MEDIUM = process.env.UTM_MEDIUM || "social";
const UTM_CAMPAIGN = process.env.UTM_CAMPAIGN || "Social_MBA_Form_Test";
const LOG_RETENTION_DAYS = parseInt(process.env.LOG_RETENTION_DAYS) || 30;

// Validate required environment variables
if (!PAGE_ACCESS_TOKEN) {
  console.error("❌ PAGE_ACCESS_TOKEN is required in .env file");
  process.exit(1);
}

// ✅ Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "Webhook server is running",
  });
});

// ✅ Check webhook subscriptions (for debugging)
app.get("/check-subscriptions", async (req, res) => {
  try {
    const response = await axios.get(
      `https://graph.facebook.com/v17.0/me/subscribed_apps`,
      { params: { access_token: PAGE_ACCESS_TOKEN } }
    );
    res.json(response.data);
  } catch (error) {
    res.status(500).json({
      error: error.response?.data || error.message,
    });
  }
});

// ✅ Manual log cleanup endpoint (for admin)
app.post("/cleanup-logs", (req, res) => {
  try {
    logSuccess("🧹 Manual log cleanup initiated...");
    cleanupOldLogs();
    res.json({
      status: "success",
      message: "Log cleanup completed",
      retentionDays: LOG_RETENTION_DAYS,
    });
  } catch (error) {
    logError(`❌ Manual log cleanup failed: ${error.message}`);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

const logsDir = path.join(__dirname, "logs");
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir);
  console.log("✅ logs directory created");
}

function logToFile(filename, message) {
  const logPath = path.join(logsDir, filename);
  const fullMessage = `${new Date().toISOString()} ${message}\n`;
  fs.appendFile(logPath, fullMessage, (err) => {
    if (err) console.error(`❌ Failed to write to ${filename}:`, err);
  });
}

function logSuccess(message) {
  console.log("✅", message);
  logToFile("success.log", `✅ ${message}`);
}

function logError(message) {
  console.error("❌", message);
  logToFile("error.log", `❌ ${message}`);
}

// ✅ Log rotation function
function cleanupOldLogs() {
  const logFiles = ["success.log", "error.log"];
  const cutoffTime = Date.now() - LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;

  logFiles.forEach((logFile) => {
    const logPath = path.join(logsDir, logFile);
    if (fs.existsSync(logPath)) {
      const stats = fs.statSync(logPath);
      if (stats.mtime.getTime() < cutoffTime) {
        // Archive the log instead of deleting
        const archiveName = `${logFile}.${
          new Date().toISOString().split("T")[0]
        }.archived`;
        const archivePath = path.join(logsDir, archiveName);
        try {
          fs.renameSync(logPath, archivePath);
          logSuccess(`📁 Archived old log: ${logFile} → ${archiveName}`);
        } catch (err) {
          console.error(`❌ Failed to archive ${logFile}:`, err);
        }
      }
    }
  });

  // Clean up old lead JSON files
  const leadFiles = fs
    .readdirSync(logsDir)
    .filter((file) => file.startsWith("lead-") && file.endsWith(".json"));
  leadFiles.forEach((leadFile) => {
    const leadPath = path.join(logsDir, leadFile);
    const stats = fs.statSync(leadPath);
    if (stats.mtime.getTime() < cutoffTime) {
      try {
        fs.unlinkSync(leadPath);
        logSuccess(`🗑️ Cleaned up old lead file: ${leadFile}`);
      } catch (err) {
        console.error(`❌ Failed to delete ${leadFile}:`, err);
      }
    }
  });
}

// ✅ Verification endpoint
app.get("/gla_webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  logSuccess(`Verification attempt: mode=${mode}, token=${token}`);
  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    logSuccess("Webhook verified successfully");
    res.status(200).send(challenge);
  } else {
    logError("Webhook verification failed");
    res.sendStatus(403);
  }
});

// ✅ Lead notification endpoint
app.post("/gla_webhook", async (req, res) => {
  try {
    const body = req.body;
    logSuccess(`📥 Incoming payload:\n${JSON.stringify(body, null, 2)}`);

    // Log headers for debugging
    logSuccess(`📋 Headers: ${JSON.stringify(req.headers, null, 2)}`);

    if (body.object === "page") {
      let processedLeads = 0;

      for (const entry of body.entry || []) {
        logSuccess(`📄 Processing entry: ${entry.id}`);

        for (const change of entry.changes || []) {
          logSuccess(`🔄 Processing change field: ${change.field}`);

          if (change.field === "leadgen") {
            const leadId = change.value.leadgen_id;
            const formId = change.value.form_id;
            const adId = change.value.ad_id;
            const pageId = change.value.page_id;

            logSuccess(
              `📊 Lead Details: ID=${leadId}, Form=${formId}, Ad=${adId}, Page=${pageId}`
            );

            if (!leadId || !formId) {
              logError("Missing leadgen_id or form_id in webhook payload");
              continue;
            }

            logSuccess(`🔔 New lead ID: ${leadId}, Form ID: ${formId}`);

            try {
              // Get current valid token
              const currentToken = await getCurrentToken();

              const response = await axios.get(
                `https://graph.facebook.com/v17.0/${leadId}`,
                { params: { access_token: currentToken } }
              );

              const leadData = response.data;

              // Save raw lead to file
              fs.writeFileSync(
                path.join(logsDir, `lead-${leadId}.json`),
                JSON.stringify(leadData, null, 2)
              );

              logSuccess(`📋 Lead data:\n${JSON.stringify(leadData, null, 2)}`);

              const getField = (name) => {
                return (
                  leadData.field_data.find(
                    (f) =>
                      f.name.toLowerCase().replace(/\s+/g, "_") ===
                      name.toLowerCase()
                  )?.values[0] || ""
                );
              };

              const crmPayload = {
                Name: getField("full_name"),
                DOB: DEFAULT_DOB,
                EmailId: getField("email"),
                Mobile: getField("phone_number"),
                ProgramCode: DEFAULT_PROGRAM_CODE,
                source: DEFAULT_SOURCE,
                City: getField("city"),
                utm_medium: UTM_MEDIUM,
                utm_campaign: UTM_CAMPAIGN,
                utm_term: "",
                utm_content: "",
              };

              logSuccess(`📤 Sending to CRM: ${JSON.stringify(crmPayload)}`);

              const crmResponse = await axios.get(CRM_API_URL, {
                params: crmPayload,
              });

              logSuccess(
                `✅ CRM Response [${crmResponse.status}]: ${JSON.stringify(
                  crmResponse.data
                )}`
              );

              processedLeads++;
            } catch (err) {
              logError(
                `❌ Error during lead fetch or CRM push: ${
                  err.response?.data || err.message
                }`
              );
            }
          } else {
            logSuccess(`ℹ️ Ignoring non-leadgen field: ${change.field}`);
          }
        }
      }

      logSuccess(`✅ Processed ${processedLeads} leads successfully`);
      res.status(200).send("EVENT_RECEIVED");
    } else {
      logError(`❌ Unknown object in webhook payload: ${body.object}`);
      res.sendStatus(404);
    }
  } catch (err) {
    logError(`❌ Error processing webhook payload: ${err.message}`);
    res.sendStatus(500);
  }
});

// ✅ Test webhook endpoint for debugging
app.post("/test-webhook", (req, res) => {
  try {
    const body = req.body;
    logSuccess(`🧪 Test webhook payload:\n${JSON.stringify(body, null, 2)}`);

    // Simulate leadgen webhook
    const testPayload = {
      object: "page",
      entry: [
        {
          id: "test_page_id",
          time: Math.floor(Date.now() / 1000),
          changes: [
            {
              field: "leadgen",
              value: {
                ad_id: "test_ad_id",
                form_id: "test_form_id",
                leadgen_id: "test_lead_id",
                created_time: Math.floor(Date.now() / 1000),
                page_id: "test_page_id",
              },
            },
          ],
        },
      ],
    };

    logSuccess(`🧪 Test payload created for debugging`);
    res.json({
      status: "success",
      message: "Test webhook endpoint working",
      testPayload: testPayload,
    });
  } catch (error) {
    logError(`❌ Test webhook error: ${error.message}`);
    res.status(500).json({
      status: "error",
      message: error.message,
    });
  }
});

// ✅ Enhanced webhook debugging endpoint
app.get("/debug-webhook", async (req, res) => {
  try {
    const debugInfo = {
      server: {
        port: PORT,
        verifyToken: VERIFY_TOKEN,
        hasPageToken: !!PAGE_ACCESS_TOKEN,
        timestamp: new Date().toISOString(),
      },
      facebook: {
        pageId: null,
        pageName: null,
        subscriptions: null,
        forms: null,
        recentLeads: null,
      },
      logs: {
        successLog: null,
        errorLog: null,
        leadFiles: [],
      },
    };

    // Check Facebook API
    if (PAGE_ACCESS_TOKEN) {
      try {
        const meResponse = await axios.get(
          `https://graph.facebook.com/v17.0/me`,
          { params: { access_token: PAGE_ACCESS_TOKEN } }
        );
        debugInfo.facebook.pageId = meResponse.data.id;
        debugInfo.facebook.pageName = meResponse.data.name;
      } catch (error) {
        debugInfo.facebook.error = error.response?.data || error.message;
      }
    }

    // Check logs
    const logsDir = path.join(__dirname, "logs");
    if (fs.existsSync(logsDir)) {
      const files = fs.readdirSync(logsDir);
      debugInfo.logs.leadFiles = files.filter(
        (f) => f.startsWith("lead-") && f.endsWith(".json")
      );

      const successLog = path.join(logsDir, "success.log");
      const errorLog = path.join(logsDir, "error.log");

      if (fs.existsSync(successLog)) {
        const stats = fs.statSync(successLog);
        debugInfo.logs.successLog = {
          exists: true,
          size: stats.size,
          modified: stats.mtime,
        };
      }

      if (fs.existsSync(errorLog)) {
        const stats = fs.statSync(errorLog);
        debugInfo.logs.errorLog = {
          exists: true,
          size: stats.size,
          modified: stats.mtime,
        };
      }
    }

    res.json(debugInfo);
  } catch (error) {
    res.status(500).json({
      error: error.message,
    });
  }
});

// ✅ Automated token management (works even when users log out)
const AutomatedTokenManager = require("./automated_token_manager.js");

let tokenManager = null;
let currentToken = null;

// Initialize automated token manager
async function initializeTokenManager() {
  try {
    tokenManager = new AutomatedTokenManager();

    // Get initial valid token
    currentToken = await tokenManager.getValidToken();

    if (currentToken && currentToken !== PAGE_ACCESS_TOKEN) {
      logSuccess(
        `🔄 Updated to new token: ${currentToken.substring(0, 20)}...`
      );
      // Update the global token
      global.PAGE_ACCESS_TOKEN = currentToken;
    }

    logSuccess("✅ Automated token manager initialized");

    // Start monitoring
    await tokenManager.startMonitoring();
  } catch (error) {
    logError(`❌ Token manager initialization failed: ${error.message}`);
  }
}

// Function to get current valid token
async function getCurrentToken() {
  if (tokenManager) {
    try {
      const validToken = await tokenManager.getValidToken();
      if (validToken && validToken !== currentToken) {
        logSuccess("🔄 Token refreshed automatically");
        currentToken = validToken;
        global.PAGE_ACCESS_TOKEN = validToken;
      }
      return validToken || currentToken || PAGE_ACCESS_TOKEN;
    } catch (error) {
      logError(`❌ Token refresh failed: ${error.message}`);
      return currentToken || PAGE_ACCESS_TOKEN;
    }
  }
  return PAGE_ACCESS_TOKEN;
}

// Initialize on startup
initializeTokenManager();

process.on("uncaughtException", (err) => {
  logError(`❌ Uncaught Exception: ${err.stack}`);
});

process.on("unhandledRejection", (reason, promise) => {
  logError(`❌ Unhandled Rejection: ${reason}`);
});

app.listen(PORT, () => {
  logSuccess(`🚀 Webhook server running at http://localhost:${PORT}`);
  logSuccess(`📁 Log retention: ${LOG_RETENTION_DAYS} days`);
  logSuccess(`🔧 CRM endpoint: ${CRM_API_URL}`);
  logSuccess(`🔔 Facebook webhook ready on /gla_webhook`);
  logSuccess(`💡 Available endpoints:`);
  logSuccess(`   GET  /health - Server health check`);
  logSuccess(`   GET  /check-subscriptions - Debug webhook subscriptions`);
  logSuccess(`   POST /cleanup-logs - Manual log cleanup`);
  logSuccess(`   GET  /gla_webhook - Facebook verification`);
  logSuccess(`   POST /gla_webhook - Lead notifications`);
});

// dont delete this line

// "EAAUZA8UIhozIBPHZA9ZButwRbK0f3aX9lQWs9pn2HhkHp244xGYogBq7NVU7UtDjuvU3JcVorH0DY23ZBuqt8H3RlBiCkmiPMl1gdHn123
// MPBz3pZCeFTwS96sMyH1GZBgRTUjnXKzi8eUVgAfBsjHfwZAtEIauarPIUsjywpGXTerAaTWMfeZAN0dbdp2xkZCgZDZD";
