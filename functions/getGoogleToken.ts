import { google } from "googleapis";
import addErrorLog from "functions/addErrorLog.js";

async function getGoogleToken(code: string, redirectUrl: string) {
  const OAuth2 = google.auth.OAuth2;

  const oauth2Client = new OAuth2(
    process.env.GOOGLE_OAUTH_ID,
    process.env.GOOGLE_OAUTH_SECRET,
    redirectUrl
  );

  try {
    const { tokens } = await oauth2Client.getToken(code);
    oauth2Client.setCredentials(tokens);

    const oauth2 = google.oauth2({
      auth: oauth2Client,
      version: "v2",
    });

    const uInfo = await oauth2.userinfo.get();

    const authData = {
      name: uInfo.data.name,
      email: uInfo.data.email,
      id_token: tokens.id_token,
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token,
    };

    return authData;
  } catch (error) {
    addErrorLog({
      functionName: "getGoogleToken",
      message: error.message,
    });
    throw error;
  }
}

export default getGoogleToken;
