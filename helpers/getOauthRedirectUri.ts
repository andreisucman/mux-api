import * as dotenv from "dotenv";
dotenv.config();

export default function getOauthRedirectUri(redirectPath: string) {
  let redirectUrl = "";

  switch (redirectPath) {
    case "/scan/progress":
      redirectUrl = process.env.SCAN_PROGRESS_REDIRECT_URI;
      break;
    case "/scan/food":
      redirectUrl = process.env.SCAN_FOOD_REDIRECT_URI;
      break;
    case "/tasks":
      redirectUrl = process.env.TASKS_REDIRECT_URI;
      break;
    case "/club/routines":
      redirectUrl = process.env.CLUB_ROUTINES_REDIRECT_URI;
      break;
    case "/club/progress":
      redirectUrl = process.env.CLUB_PROGRESS_REDIRECT_URI;
      break;
    case "/club/proof":
      redirectUrl = process.env.CLUB_PROOF_REDIRECT_URI;
      break;
    case "/club/diary":
      redirectUrl = process.env.CLUB_DIARY_REDIRECT_URI;
      break;
    case "/club/about":
      redirectUrl = process.env.CLUB_ABOUT_REDIRECT_URI;
      break;
    case "/club/answers":
      redirectUrl = process.env.CLUB_ANSWERS_REDIRECT_URI;
      break;
    case "/plans":
      redirectUrl = process.env.PLANS_REDIRECT_URI;
      break;
    case "/rewards":
      redirectUrl = process.env.REWARDS_REDIRECT_URI;
      break;
    default:
      redirectUrl = process.env.WAITROOM_REDIRECT_URI;
  }

  return redirectUrl;
}
