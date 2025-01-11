import { Router, NextFunction } from "express";
import { google } from "googleapis";
import getOauthRedirectUri from "@/helpers/getOauthRedirectUri.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.get("/", async (req, res, next: NextFunction) => {
  const { state } = req.query;

  try {
    const parsedState = state
      ? JSON.parse(decodeURIComponent(state as string))
      : {};
    const { redirectPath } = parsedState;

    const redirectUrl = getOauthRedirectUri(redirectPath);

    const OAuth2 = google.auth.OAuth2;

    const oauth2Client = new OAuth2(
      process.env.GOOGLE_OAUTH_ID,
      process.env.GOOGLE_OAUTH_SECRET,
      redirectUrl
    );

    const loginPayload: { [key: string]: any } = {
      access_type: "offline",
      scope: ["email", "openid", "profile"],
    };

    if (state) loginPayload.state = state;

    const loginLink = oauth2Client.generateAuthUrl(loginPayload);

    res.status(200).json({ message: loginLink });
  } catch (err) {
    next(err);
  }
});

export default route;
