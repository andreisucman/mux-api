import { Router, NextFunction } from "express";
import { google } from "googleapis";

const route = Router();

route.get("/", async (req, res, next: NextFunction) => {
  const { state } = req.query;

  try {
    const parsedState = state
      ? JSON.parse(decodeURIComponent(state as string))
      : {};

    const { redirectTo } = parsedState;

    const redirectUrl =
      redirectTo === "pricing"
        ? process.env.PRICING_REDIRECT_URI
        : redirectTo === "track"
        ? process.env.TRACK_REDIRECT_URI
        : process.env.ROUTINE_REDIRECT_URI;

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
    next(err)
  }
});

export default route;
