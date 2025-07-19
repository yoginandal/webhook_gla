const axios = require("axios");
require("dotenv").config();

class PageTokenManager {
  constructor() {
    this.appId = process.env.FACEBOOK_APP_ID;
    this.appSecret = process.env.FACEBOOK_APP_SECRET;
    this.pageId = process.env.FACEBOOK_PAGE_ID;
    this.currentToken = process.env.PAGE_ACCESS_TOKEN;
  }

  // Convert short token to long-lived (60 days)
  async extendToken(shortToken) {
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
      return null;
    }
  }

  // Test if token is valid
  async testToken(token) {
    try {
      const response = await axios.get(`https://graph.facebook.com/v17.0/me`, {
        params: { access_token: token },
      });

      console.log(`✅ Token valid for: ${response.data.name}`);
      return true;
    } catch (error) {
      console.error("❌ Token invalid:", error.response?.data?.error?.message);
      return false;
    }
  }

  // Get page token using app token
  async getPageToken() {
    try {
      // First get app token
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

      // Use app token to get page token
      const pageResponse = await axios.get(
        `https://graph.facebook.com/v17.0/${this.pageId}`,
        {
          params: {
            fields: "access_token",
            access_token: appToken,
          },
        }
      );

      console.log("✅ Got new page token");
      return pageResponse.data.access_token;
    } catch (error) {
      console.error(
        "❌ Failed to get page token:",
        error.response?.data || error.message
      );
      return null;
    }
  }

  // Main function to ensure valid token
  async ensureValidToken() {
    console.log("🔄 Checking token validity...");

    // Test current token
    const isCurrentValid = await this.testToken(this.currentToken);

    if (isCurrentValid) {
      console.log("✅ Current token is valid");
      return this.currentToken;
    }

    console.log("🔄 Current token invalid, getting new one...");

    // Try to get new page token
    const newToken = await this.getPageToken();

    if (newToken) {
      console.log("✅ Got new token, updating .env file...");

      // Update .env file
      const fs = require("fs");
      const envPath = ".env";
      let envContent = fs.readFileSync(envPath, "utf8");

      // Replace the token line
      envContent = envContent.replace(
        /PAGE_ACCESS_TOKEN=.*/,
        `PAGE_ACCESS_TOKEN=${newToken}`
      );

      fs.writeFileSync(envPath, envContent);
      console.log("✅ .env file updated");

      return newToken;
    }

    console.log("❌ Failed to get new token");
    return null;
  }
}

// Usage
async function refreshToken() {
  const manager = new PageTokenManager();
  const validToken = await manager.ensureValidToken();

  if (validToken) {
    console.log("✅ Token refresh successful");
    console.log("🔄 Restart your webhook: pm2 restart gla_webhook");
  } else {
    console.log("❌ Token refresh failed");
    console.log("💡 Manual intervention required");
  }
}

// Run if called directly
if (require.main === module) {
  refreshToken();
}

module.exports = PageTokenManager;
