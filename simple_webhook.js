const express = require("express");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

// Load environment variables
require("dotenv").config();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Environment variables
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

// Create logs directory
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

// Health check endpoint
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    message: "Webhook server is running",
  });
});

// Test token endpoint
app.get("/test-token", async (req, res) => {
  try {
    const response = await axios.get(`https://graph.facebook.com/v17.0/me`, {
      params: { access_token: PAGE_ACCESS_TOKEN },
    });

    res.json({
      status: "success",
      message: "Token is valid",
      page: {
        id: response.data.id,
        name: response.data.name,
        category: response.data.category,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Token is invalid",
      error: error.response?.data?.error?.message || error.message,
    });
  }
});

// Verification endpoint
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

// Lead notification endpoint
app.post("/gla_webhook", async (req, res) => {
  try {
    const body = req.body;
    logSuccess(`📥 Incoming payload:\n${JSON.stringify(body, null, 2)}`);

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
              const response = await axios.get(
                `https://graph.facebook.com/v17.0/${leadId}`,
                { params: { access_token: PAGE_ACCESS_TOKEN } }
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

// Error handlers
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
  logSuccess(`   GET  /test-token - Test token validity`);
  logSuccess(`   GET  /gla_webhook - Facebook verification`);
  logSuccess(`   POST /gla_webhook - Lead notifications`);
});
