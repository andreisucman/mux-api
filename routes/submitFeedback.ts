import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import sendEmail from "@/functions/sendEmail.js";
import getEmailContent from "@/helpers/getEmailContent.js";
import getUserInfo from "@/functions/getUserInfo.js";
import { adminDb } from "@/init.js";
import doWithRetries from "@/helpers/doWithRetries.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { text, screenShots = [], videos=[] } = req.body;

  if (!text || !Array.isArray(screenShots)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await getUserInfo({ userId: req.userId, projection: { email: 1 } });
    if (!userInfo?.email) {
      res.status(404).json({ error: "User not found" });
      return;
    }

    let { body: html } = await getEmailContent({ emailType: "feedback", accessToken: null });
    let updatedHtml = html.replace("{{feedback}}", text).replace("{{userId}}", req.userId);

    if (screenShots.length > 0) {
      const images = screenShots
        .map((url) => `<img src="${url}" style="width: 768px; height: 768px; object-fit: contain" alt=""/>`)
        .join("\n");
      updatedHtml = updatedHtml.replace("{{images}}", `<div>${images}</div>`);
    } else {
      updatedHtml = updatedHtml.replace("{{images}}", "");
    }

    if (videos.length >0) {
      const videoLinks = videos
        .map((url,i) => `<a href="${url}">${`Video ${i+1}`}</a>`)
        .join("\n");
      updatedHtml = updatedHtml.replace("{{videos}}", `<div>${videoLinks}</div>`);
    } else {
       updatedHtml = updatedHtml.replace("{{videos}}", "");
    }

    const subjectSnippet = text.length > 25 ? `${text.slice(0, 25)}...` : text;
    await sendEmail({
      to: "info@muxout.com",
      subject: `Feedback: ${subjectSnippet}`,
      replyTo: userInfo.email,
      html: updatedHtml,
    });

    await doWithRetries(() =>
      adminDb
        .collection("Feedback")
        .insertOne({ userId: userInfo._id, email: userInfo.email, text, images: screenShots, videos, createdAt: new Date() })
    );

    res.status(200).end();
  } catch (err) {
    next(err);
  }
});

export default route;
