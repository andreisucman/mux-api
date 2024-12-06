import * as dotenv from "dotenv";
dotenv.config();

export default function getOauthRedirectUri(redirectPath: string) {
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
    case "/routines":
      redirectUrl = process.env.ROUTINES_REDIRECT_URI;
      break;
    case "/club/routine":
      redirectUrl = process.env.CLUB_ROUTINE_REDIRECT_URI;
      break;
    case "/club/about":
      redirectUrl = process.env.CLUB_ABOUT_REDIRECT_URI;
      break;
    default:
      redirectUrl = process.env.ROUTINES_REDIRECT_URI;
  }

  return redirectUrl;
}
