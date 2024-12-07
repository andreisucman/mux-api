import { ObjectId } from "mongodb";
import fs from "fs/promises";
import { nanoid } from "nanoid";
import httpError from "@/helpers/httpError.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import getEmailContent from "@/helpers/getEmailContent.js";
import sendEmail from "functions/sendEmail.js";
import { db } from "init.js";

type Props = {
  userId: string;
  email: string;
};

export default async function sendConfirmationCode({ userId, email }: Props) {
  try {
    if (!userId) throw httpError("userId is missing");
    if (!email) throw httpError("email is missing");

    const randomId = nanoid(5).toUpperCase();

    await doWithRetries(async () =>
      db
        .collection("ConfirmationCode")
        .updateOne(
          { _id: new ObjectId(userId) },
          { $set: { code: randomId, updatedAt: new Date() } },
          { upsert: true }
        )
    );

    const { title, path } = getEmailContent({
      accessToken: null,
      emailType: "confirmationCode",
    });

    let emailBody = await fs.readFile(path, "utf8");
    emailBody = emailBody.replace("{{code}}", randomId);

    await sendEmail({
      to: email,
      subject: title,
      html: emailBody,
    });
  } catch (err) {
    throw err;
  }
}
