const express = require("express");
const bodyParser = require("body-parser");
const axios = require("axios");
const fs = require("fs");
const path = require("path");

const app = express();
app.use(bodyParser.json());
app.use(express.urlencoded({ extended: true }));

// ✅ Replace with your actual values
const VERIFY_TOKEN = "GLA_leads_123";
const PAGE_ACCESS_TOKEN =
  "EAAUZA8UIhozIBPBDjseUe7dlmIZBptaMSCtRuHDP54b2yTFzkkCX9BGNs6vzmx9jQRSgIp3ZBThgm0nAcpxR5LRkzG0xdHcxCNieNOXDJVhB7klO7ffDjteldKZCLGVcU3lFXZAQj3ZBZCMac1KNvtRHrK73SAfuI01FhEk5avrIUNUTmqLZAtPx7Fb5vrmrttoJw18qRFkSrFE1DCz2Ig03mz7UPbPjNLFHZC6F3NKR7l98ZD";

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

app.get("/webhook", (req, res) => {
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

app.post("/webhook", async (req, res) => {
  const body = req.body;
  logSuccess(`📥 Incoming payload:\n${JSON.stringify(body, null, 2)}`);

  if (body.object === "page") {
    for (const entry of body.entry) {
      for (const change of entry.changes) {
        if (change.field === "leadgen") {
          const leadId = change.value.leadgen_id;
          const formId = change.value.form_id;
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

            // Helper to get a field
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
              DOB: "12/7/2000",
              EmailId: getField("email"),
              Mobile: getField("phone_number"),
              ProgramCode: "OGLAMBA201",
              source: "Stealth",
              City: getField("city"),
              utm_medium: "social",
              utm_campaign: "Social_MBA_Form_Test",
              utm_term: "",
              utm_content: "",
            };

            logSuccess(`📤 Sending to CRM: ${JSON.stringify(crmPayload)}`);

            const crmResponse = await axios.get(
              "https://glawebapi.glaonline.com/api/ChannelPartner/CPRegistrationOnline_API",
              { params: crmPayload }
            );

            logSuccess(
              `✅ CRM Response [${crmResponse.status}]: ${JSON.stringify(
                crmResponse.data
              )}`
            );
          } catch (err) {
            logError(
              `❌ Error during lead fetch or CRM push: ${
                err.response?.data || err.message
              }`
            );
          }
        }
      }
    }

    res.status(200).send("EVENT_RECEIVED");
  } else {
    logError("❌ Unknown object in webhook payload");
    res.sendStatus(404);
  }
});

process.on("uncaughtException", (err) => {
  logError(`❌ Uncaught Exception: ${err.stack}`);
});

process.on("unhandledRejection", (reason, promise) => {
  logError(`❌ Unhandled Rejection: ${reason}`);
});

app.listen(3007, () => {
  logSuccess("🚀 Webhook server running at http://localhost:3007");
});
