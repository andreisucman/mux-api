import { Router, NextFunction } from "express";
import { google } from "googleapis";

const route = Router();

route.get("/", async (req, res, next: NextFunction) => {
  const { state } = req.query;

  try {
    const parsedState = state
      ? JSON.parse(decodeURIComponent(state as string))
      : {};

    const { redirectPath } = parsedState;

    let redirectUrl = "";

    switch (redirectPath) {
      case "/scan/progress":
        redirectUrl = process.env.SCAN_PROGRESS_REDIRECT_URI;
        break;
      case "/scan/style":
        redirectUrl = process.env.SCAN_STYLE_REDIRECT_URI;
        break;
      case "/scan/food":
        redirectUrl = process.env.SCAN_FOOD_REDIRECT_URI;
        break;
      case "/routine":
        redirectUrl = process.env.ROUTINE_REDIRECT_URI;
        break;
      case "/club/routine":
        redirectUrl = process.env.CLUB_ROUTINE_REDIRECT_URI;
        break;
      case "/club/about":
        redirectUrl = process.env.CLUB_ABOUT_REDIRECT_URI;
        break;
      default:
        redirectUrl = process.env.ROUTINE_REDIRECT_URI;
    }

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
