const axios = require("axios");
const fs = require("fs");
require("dotenv").config();

class AutomatedTokenManager {
  constructor() {
    this.appId = process.env.FACEBOOK_APP_ID;
    this.appSecret = process.env.FACEBOOK_APP_SECRET;
    this.pageId = process.env.FACEBOOK_PAGE_ID;
    // Use the provided System User token that never expires
    this.systemUserToken =
      "EAAUZA8UIhozIBPHZA9ZButwRbK0f3aX9lQWs9pn2HhkHp244xGYogBq7NVU7UtDjuvU3JcVorH0DY23ZBuqt8H3RlBiCkmiPMl1gdHn123MPBz3pZCeFTwS96sMyH1GZBgRTUjnXKzi8eUVgAfBsjHfwZAtEIauarPIUsjywpGXTerAaTWMfeZAN0dbdp2xkZCgZDZD";
    this.pageToken = process.env.PAGE_ACCESS_TOKEN;
    this.currentToken = null;
    this.lastRefresh = 0;
    this.refreshInterval = 6 * 60 * 60 * 1000; // 6 hours (more frequent for reliability)
  }

  // Test if token is valid
  async testToken(token, tokenType = "Unknown") {
    try {
      const response = await axios.get(`https://graph.facebook.com/v17.0/me`, {
        params: { access_token: token },
      });

      console.log(`✅ ${tokenType} token is valid for: ${response.data.name}`);
      return { valid: true, data: response.data };
    } catch (error) {
      console.error(
        `❌ ${tokenType} token is invalid:`,
        error.response?.data?.error?.message
      );
      return { valid: false, error: error.response?.data?.error };
    }
  }

  // Get page token using System User token (most reliable)
  async getPageTokenWithSystemUser() {
    try {
      // Test System User token first
      const systemUserTest = await this.testToken(
        this.systemUserToken,
        "System User"
      );
      if (!systemUserTest.valid) {
        console.log("❌ System User token is invalid");
        return null;
      }

      console.log("✅ System User token is valid, generating page token...");

      // Get page token using System User
      const response = await axios.get(
        `https://graph.facebook.com/v17.0/${this.pageId}`,
        {
          params: {
            fields: "access_token",
            access_token: this.systemUserToken,
          },
        }
      );

      console.log("✅ Generated fresh page token using System User");
      return response.data.access_token;
    } catch (error) {
      console.error(
        "❌ Failed to get page token with System User:",
        error.response?.data || error.message
      );
      return null;
    }
  }

  // Get page token using app token (fallback)
  async getPageTokenWithApp() {
    if (!this.appId || !this.appSecret) {
      console.log("⚠️ No App credentials configured");
      return null;
    }

    try {
      // Get app token
      const appResponse = await axios.get(
        `https://graph.facebook.com/v17.0/oauth/access_token`,
        {
          params: {
            client_id: this.appId,
            client_secret: this.appSecret,
            grant_type: "client_credentials",
          },
        }
      );

      const appToken = appResponse.data.access_token;

      // Get page token using app token
      const pageResponse = await axios.get(
        `https://graph.facebook.com/v17.0/${this.pageId}`,
        {
          params: {
            fields: "access_token",
            access_token: appToken,
          },
        }
      );

      console.log("✅ Got page token using App token");
      return pageResponse.data.access_token;
    } catch (error) {
      console.error(
        "❌ Failed to get page token with App:",
        error.response?.data || error.message
      );
      return null;
    }
  }

  // Convert short token to long-lived
  async extendToken(shortToken) {
    if (!this.appId || !this.appSecret) {
      console.log("⚠️ No App credentials for token extension");
      return shortToken;
    }

    try {
      const response = await axios.get(
        `https://graph.facebook.com/v17.0/oauth/access_token`,
        {
          params: {
            grant_type: "fb_exchange_token",
            client_id: this.appId,
            client_secret: this.appSecret,
            fb_exchange_token: shortToken,
          },
        }
      );

      console.log("✅ Token extended to 60 days");
      return response.data.access_token;
    } catch (error) {
      console.error(
        "❌ Failed to extend token:",
        error.response?.data || error.message
      );
      return shortToken;
    }
  }

  // Main function to get valid token
  async getValidToken() {
    const now = Date.now();

    // Check if we need to refresh (every 6 hours)
    if (this.currentToken && now - this.lastRefresh < this.refreshInterval) {
      const test = await this.testToken(this.currentToken, "Current");
      if (test.valid) {
        return this.currentToken;
      }
    }

    console.log("🔄 Generating fresh page token using System User...");

    // Always try System User method first (most reliable)
    let newToken = await this.getPageTokenWithSystemUser();

    // Fallback to App method if System User fails
    if (!newToken) {
      console.log("🔄 System User method failed, trying App method...");
      newToken = await this.getPageTokenWithApp();
    }

    // Fallback to extending current token
    if (!newToken && this.pageToken) {
      console.log("🔄 Trying to extend current token...");
      newToken = await this.extendToken(this.pageToken);
    }

    if (newToken) {
      // Test the new token
      const test = await this.testToken(newToken, "New");
      if (test.valid) {
        this.currentToken = newToken;
        this.lastRefresh = now;

        // Update .env file
        await this.updateEnvFile(newToken);

        console.log("✅ Fresh page token generated and validated");
        return newToken;
      }
    }

    console.log("❌ Failed to get valid token");
    return this.currentToken || this.pageToken;
  }

  // Update .env file with new token
  async updateEnvFile(newToken) {
    try {
      const envPath = ".env";
      let envContent = fs.readFileSync(envPath, "utf8");

      // Replace the token line
      envContent = envContent.replace(
        /PAGE_ACCESS_TOKEN=.*/,
        `PAGE_ACCESS_TOKEN=${newToken}`
      );

      fs.writeFileSync(envPath, envContent);
      console.log("✅ .env file updated with fresh token");
    } catch (error) {
      console.error("❌ Failed to update .env file:", error.message);
    }
  }

  // Start monitoring
  async startMonitoring() {
    console.log("🚀 Starting automated token monitoring with System User...");
    console.log(
      "✅ Using never-expiring System User token for page token generation"
    );

    // Initial token check
    const validToken = await this.getValidToken();
    if (validToken) {
      console.log("✅ Initial page token generation successful");
    }

    // Set up periodic monitoring
    setInterval(async () => {
      try {
        await this.getValidToken();
      } catch (error) {
        console.error("❌ Token monitoring error:", error.message);
      }
    }, this.refreshInterval);

    console.log(
      `🔄 Token monitoring active (generating fresh tokens every ${
        this.refreshInterval / (60 * 60 * 1000)
      } hours)`
    );
  }
}

// Export for use in webhook
module.exports = AutomatedTokenManager;

// Run if called directly
if (require.main === module) {
  const manager = new AutomatedTokenManager();
  manager.startMonitoring();
}
