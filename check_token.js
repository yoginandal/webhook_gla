const axios = require("axios");
require("dotenv").config();

const PAGE_ACCESS_TOKEN = process.env.PAGE_ACCESS_TOKEN;

async function checkToken() {
  console.log("🔍 Facebook Token Analysis");
  console.log("=".repeat(50));

  if (!PAGE_ACCESS_TOKEN) {
    console.error("❌ PAGE_ACCESS_TOKEN is missing!");
    return;
  }

  try {
    // 1. Check token info
    console.log("\n📋 Token Information:");
    const tokenInfo = await axios.get(
      `https://graph.facebook.com/debug_token`,
      {
        params: {
          input_token: PAGE_ACCESS_TOKEN,
          access_token: PAGE_ACCESS_TOKEN,
        },
      }
    );

    console.log(`✅ Token Type: ${tokenInfo.data.data.type}`);
    console.log(`✅ App ID: ${tokenInfo.data.data.app_id}`);
    console.log(`✅ User ID: ${tokenInfo.data.data.user_id}`);
    console.log(
      `✅ Expires At: ${
        tokenInfo.data.data.expires_at
          ? new Date(tokenInfo.data.data.expires_at * 1000)
          : "Never"
      }`
    );
    console.log(`✅ Scopes: ${tokenInfo.data.data.scopes.join(", ")}`);

    // 2. Check if it's a system user token
    if (tokenInfo.data.data.type === "USER") {
      console.log("\n🔧 This appears to be a User Token");

      // Check if it's a system user
      try {
        const systemUserCheck = await axios.get(
          `https://graph.facebook.com/v17.0/me`,
          { params: { access_token: PAGE_ACCESS_TOKEN } }
        );
        console.log(`✅ User Name: ${systemUserCheck.data.name}`);
        console.log(`✅ User ID: ${systemUserCheck.data.id}`);
      } catch (error) {
        console.log(
          "❌ Error checking user info:",
          error.response?.data?.error?.message
        );
      }
    }

    // 3. Test page access
    console.log("\n📄 Testing Page Access:");
    try {
      const pageResponse = await axios.get(
        `https://graph.facebook.com/v17.0/me`,
        { params: { access_token: PAGE_ACCESS_TOKEN } }
      );
      console.log(`✅ Page ID: ${pageResponse.data.id}`);
      console.log(`✅ Page Name: ${pageResponse.data.name}`);
      console.log(`✅ Page Category: ${pageResponse.data.category}`);
    } catch (error) {
      console.log(
        "❌ Page access error:",
        error.response?.data?.error?.message
      );
    }

    // 4. Check permissions
    console.log("\n🔐 Checking Permissions:");
    try {
      const permissionsResponse = await axios.get(
        `https://graph.facebook.com/v17.0/me/permissions`,
        { params: { access_token: PAGE_ACCESS_TOKEN } }
      );

      console.log("✅ Permissions:");
      permissionsResponse.data.data.forEach((perm) => {
        console.log(`   ${perm.permission}: ${perm.status}`);
      });
    } catch (error) {
      console.log(
        "❌ Permissions check error:",
        error.response?.data?.error?.message
      );
    }
  } catch (error) {
    console.error(
      "❌ Token check failed:",
      error.response?.data || error.message
    );

    if (error.response?.data?.error?.code === 190) {
      console.log("\n💡 Token is invalid. Possible causes:");
      console.log("1. Token has expired");
      console.log("2. User logged out");
      console.log("3. App permissions changed");
      console.log("4. Token was revoked");
      console.log("\n🔧 Solutions:");
      console.log("1. Generate new System User Token");
      console.log("2. Check Facebook App settings");
      console.log("3. Verify System User permissions");
    }
  }
}

checkToken();
