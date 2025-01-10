import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Request, Response, NextFunction } from "express";
import fs from "fs/promises";
import crypto from "crypto";
import { db } from "init.js";
import sendEmail from "@/functions/sendEmail.js";
import getEmailContent from "@/helpers/getEmailContent.js";
import { minutesFromNow } from "@/helpers/utils.js";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum } from "@/types.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const { email } = req.body;

  if (!email) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await doWithRetries(async () =>
      db
        .collection("User")
        .findOne(
          { email, moderationStatus: ModerationStatusEnum.ACTIVE },
          { projection: { _id: 1 } }
        )
    );

    if (!userInfo) {
      res.status(200).json({ error: "There are no accounts with this email." });
      return;
    }

    const code = crypto.randomBytes(32).toString("hex");
    const accessToken = crypto.createHash("sha256").update(code).digest("hex");

    const fifteenMinutesFromNow = minutesFromNow(15);

    const temporaryAccessDetails = {
      code: accessToken,
      expiresOn: fifteenMinutesFromNow,
    };

    const { _id: userId } = userInfo;

    await doWithRetries(async () =>
      db
        .collection("TemporaryAccessToken")
        .updateOne(
          { userId: new ObjectId(userId) },
          { $set: temporaryAccessDetails },
          { upsert: true }
        )
    );

    const { signedUrl, title, path } = getEmailContent({
      accessToken,
      emailType: "passwordReset",
    });

    let emailBody = await fs.readFile(path, "utf8");
    if (signedUrl) emailBody = emailBody.replace("{{link}}", signedUrl);

    await sendEmail({
      to: email,
      subject: title,
      html: emailBody,
    });

    res.status(200).json({
      message: `We have sent a password reset email to ${email}.`,
    });
  } catch (err) {
    next(httpError(err.message, err.status));
  }
});

export default route;
