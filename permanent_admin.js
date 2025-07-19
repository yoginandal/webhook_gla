const axios = require("axios");
require("dotenv").config();

class FacebookTokenManager {
  constructor() {
    this.appId = process.env.FACEBOOK_APP_ID;
    this.appSecret = process.env.FACEBOOK_APP_SECRET;
    this.pageToken = process.env.PAGE_ACCESS_TOKEN;
    this.appToken = null;
  }

  // Generate app-level token (never expires)
  async generateAppToken() {
    try {
      const response = await axios.get(
        `https://graph.facebook.com/v17.0/oauth/access_token`,
        {
          params: {
            client_id: this.appId,
            client_secret: this.appSecret,
            grant_type: "client_credentials",
          },
        }
      );

      this.appToken = response.data.access_token;
      console.log("✅ App token generated (never expires)");
      return this.appToken;
    } catch (error) {
      console.error(
        "❌ Failed to generate app token:",
        error.response?.data || error.message
      );
      return null;
    }
  }

  // Get long-lived page token
  async getLongLivedPageToken(shortToken) {
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

      console.log("✅ Long-lived page token generated (60 days)");
      return response.data.access_token;
    } catch (error) {
      console.error(
        "❌ Failed to get long-lived token:",
        error.response?.data || error.message
      );
      return null;
    }
  }

  // Test token validity
  async testToken(token, tokenType = "Unknown") {
    try {
      const response = await axios.get(`https://graph.facebook.com/v17.0/me`, {
        params: { access_token: token },
      });

      console.log(`✅ ${tokenType} token is valid`);
      console.log(`   User/Page: ${response.data.name} (${response.data.id})`);
      return true;
    } catch (error) {
      console.error(
        `❌ ${tokenType} token is invalid:`,
        error.response?.data?.error?.message
      );
      return false;
    }
  }

  // Get page access token using app token
  async getPageTokenWithAppToken(pageId) {
    if (!this.appToken) {
      await this.generateAppToken();
    }

    try {
      const response = await axios.get(
        `https://graph.facebook.com/v17.0/${pageId}`,
        {
          params: {
            fields: "access_token",
            access_token: this.appToken,
          },
        }
      );

      console.log("✅ Page token obtained using app token");
      return response.data.access_token;
    } catch (error) {
      console.error(
        "❌ Failed to get page token:",
        error.response?.data || error.message
      );
      return null;
    }
  }

  // Monitor and refresh tokens automatically
  async setupTokenMonitoring() {
    console.log("🔄 Setting up token monitoring...");

    // Test current token
    const isCurrentValid = await this.testToken(this.pageToken, "Current");

    if (!isCurrentValid) {
      console.log("🔄 Current token invalid, trying alternatives...");

      // Try app token
      const appToken = await this.generateAppToken();
      if (appToken) {
        const isAppValid = await this.testToken(appToken, "App");
        if (isAppValid) {
          console.log("✅ Using app token as fallback");
          return appToken;
        }
      }

      // Try to get page token using app token
      const pageId = "YOUR_PAGE_ID"; // Replace with your page ID
      const newPageToken = await this.getPageTokenWithAppToken(pageId);
      if (newPageToken) {
        console.log("✅ Generated new page token");
        return newPageToken;
      }
    }

    return this.pageToken;
  }
}

// Usage example
async function setupPermanentAdmin() {
  const manager = new FacebookTokenManager();

  console.log("🔐 Setting up permanent admin access...");

  // Setup monitoring
  const validToken = await manager.setupTokenMonitoring();

  if (validToken) {
    console.log("✅ Permanent admin access configured");
    console.log("💡 Update your .env file with the new token if needed");
  } else {
    console.log("❌ Failed to setup permanent admin access");
    console.log("💡 Check your Facebook App settings and permissions");
  }
}

// Run the setup
setupPermanentAdmin();
