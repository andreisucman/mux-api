import * as dotenv from "dotenv";
dotenv.config();

import path from "path";
import { __dirname } from "init.js";
import httpError from "helpers/httpError.js";

type Props = {
  accessToken: string | null;
  emailType: "passwordReset" | "confirmationCode" | "payoutsDisabled";
};

export default function getEmailContent({ accessToken, emailType }: Props) {
  try {
    const emailContentMap = {
      passwordReset: {
        title: "Muxout - Reset password",
        bodyPath: path.join(__dirname, "data/emails/passwordReset.html"),
        signedUrl: `${
          process.env.CLIENT_URL
        }/set-password?accessToken=${encodeURIComponent(accessToken)}`,
      },
      confirmationCode: {
        title: "Muxout - Confirmation code",
        bodyPath: path.join(__dirname, "data/emails/confirmationCode.html"),
        signedUrl: null as null | string,
      },
      payoutsDisabled: {
        title: "Muxout - Payouts disabled",
        bodyPath: path.join(__dirname, "data/emails/payoutsDisabled.html"),
        signedUrl: null as null | string,
      },
    };

    return {
      title: emailContentMap[emailType].title,
      path: emailContentMap[emailType].bodyPath,
      signedUrl: emailContentMap[emailType].signedUrl || "",
    };
  } catch (err) {
    throw httpError(err.message, err.status);
  }
}
