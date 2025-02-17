import { ObjectId } from "mongodb";
import { customAlphabet } from "nanoid";
import httpError from "@/helpers/httpError.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import getEmailContent from "@/helpers/getEmailContent.js";
import sendEmail from "functions/sendEmail.js";
import { minutesFromNow } from "@/helpers/utils.js";
import { db } from "init.js";
import getUserInfo from "./getUserInfo.js";

type Props = {
  userId: string;
  email?: string;
};

export default async function sendConfirmationCode({ userId, email }: Props) {
  try {
    if (!userId) throw httpError("userId is missing");

    if (!email) {
      const userInfo = await getUserInfo({ userId, projection: { email: 1 } });
      if (!userInfo) throw httpError("User not found");

      email = userInfo.email;
    }

    const nanoid = customAlphabet("qwertyuiopasdfghjklzxcvbnm1234567890", 5);
    const code = nanoid().toUpperCase();

    const fifteenMinutesFromNow = minutesFromNow(15);

    const temporaryAccessDetails = {
      code,
      updatedAt: new Date(),
      expiresOn: fifteenMinutesFromNow,
    };

    await doWithRetries(async () =>
      db
        .collection("TemporaryAccessToken")
        .updateOne(
          { userId: new ObjectId(userId) },
          { $set: temporaryAccessDetails },
          { upsert: true }
        )
    );

    const { title, body } = await getEmailContent({
      accessToken: null,
      emailType: "confirmationCode",
    });

    const emailBody = body.replace("{{code}}", code);

    await sendEmail({
      to: email,
      subject: title,
      html: emailBody,
    });
  } catch (err) {
    throw err;
  }
}
