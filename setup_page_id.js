const axios = require("axios");

// System User token that never expires
const SYSTEM_USER_TOKEN =
  "EAAUZA8UIhozIBPHZA9ZButwRbK0f3aX9lQWs9pn2HhkHp244xGYogBq7NVU7UtDjuvU3JcVorH0DY23ZBuqt8H3RlBiCkmiPMl1gdHn123MPBz3pZCeFTwS96sMyH1GZBgRTUjnXKzi8eUVgAfBsjHfwZAtEIauarPIUsjywpGXTerAaTWMfeZAN0dbdp2xkZCgZDZD";

async function setupPageId() {
  console.log("🔍 Finding your Facebook pages using System User token...");

  try {
    // Get pages accessible by System User
    const response = await axios.get(
      `https://graph.facebook.com/v17.0/me/accounts`,
      { params: { access_token: SYSTEM_USER_TOKEN } }
    );

    console.log("✅ Found pages:");
    console.log("=".repeat(50));

    response.data.data.forEach((page, index) => {
      console.log(`${index + 1}. Page Name: ${page.name}`);
      console.log(`   Page ID: ${page.id}`);
      console.log(`   Category: ${page.category}`);
      console.log(`   Access Token: ${page.access_token.substring(0, 20)}...`);
      console.log("");
    });

    if (response.data.data.length > 0) {
      console.log("💡 Add this to your .env file:");
      console.log(`FACEBOOK_PAGE_ID=${response.data.data[0].id}`);
      console.log("");
      console.log(
        "✅ The automated system will use this page ID to generate fresh tokens!"
      );
    } else {
      console.log("❌ No pages found. Check System User permissions.");
    }
  } catch (error) {
    console.error(
      "❌ Error getting pages:",
      error.response?.data || error.message
    );
  }
}

setupPageId();
