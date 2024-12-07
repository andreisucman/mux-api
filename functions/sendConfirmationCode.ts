import { ObjectId } from "mongodb";
import fs from "fs/promises";
import { customAlphabet } from "nanoid";
import httpError from "@/helpers/httpError.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import getEmailContent from "@/helpers/getEmailContent.js";
import sendEmail from "functions/sendEmail.js";
import { minutesFromNow } from "@/helpers/utils.js";
import { db } from "init.js";

type Props = {
  userId: string;
  email?: string;
};

export default async function sendConfirmationCode({ userId, email }: Props) {
  try {
    if (!userId) throw httpError("userId is missing");

    if (!email) {
      const userInfo = await doWithRetries(() =>
        db
          .collection("User")
          .findOne({ _id: new ObjectId(userId) }, { projection: { email: 1 } })
      );

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

    const { title, path } = getEmailContent({
      accessToken: null,
      emailType: "confirmationCode",
    });

    let emailBody = await fs.readFile(path, "utf8");
    emailBody = emailBody.replace("{{code}}", code);

    await sendEmail({
      to: email,
      subject: title,
      html: emailBody,
    });
  } catch (err) {
    throw err;
  }
}
