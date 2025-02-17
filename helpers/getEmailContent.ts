import * as dotenv from "dotenv";
dotenv.config();

import fs from "fs/promises";
import path from "path";
import httpError from "helpers/httpError.js";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

type Props = {
  accessToken: string | null;
  emailType: "passwordReset" | "confirmationCode" | "payoutsDisabled";
};

export default async function getEmailContent({
  accessToken,
  emailType,
}: Props) {
  let title = "";
  let body = "";
  let signedUrl = "";
  let bodyPath = "";

  try {
    switch (emailType) {
      case "passwordReset":
        title = "Muxout - Reset password";
        bodyPath = path.join(__dirname, "../data/emails/passwordReset.html");
        signedUrl = `${
          process.env.CLIENT_URL
        }/set-password?accessToken=${encodeURIComponent(accessToken)}`;
        break;
      case "confirmationCode":
        title = "Muxout - Confirmation code";
        bodyPath = path.join(__dirname, "../data/emails/confirmationCode.html");
        break;
      case "payoutsDisabled":
        title = "Muxout - Payouts disabled";
        bodyPath = path.join(__dirname, "../data/emails/payoutsDisabled.html");
        break;
    }

    body = await fs.readFile(bodyPath, "utf8");

    return {
      title,
      body,
      signedUrl,
    };
  } catch (err) {
    throw httpError(err);
  }
}
