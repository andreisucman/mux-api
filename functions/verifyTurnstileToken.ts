import * as dotenv from "dotenv";
dotenv.config();

export default async function verifyTurnstileToken(token: string, ip: string) {
  const formData = new FormData();
  formData.append("secret", process.env.TURNSTILE_SECRET);
  formData.append("response", token);
  formData.append("remoteip", ip);

  const url = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
  const result = await fetch(url, {
    body: formData,
    method: "POST",
  });

  const outcome = await result.json();

  return outcome.success;
}
