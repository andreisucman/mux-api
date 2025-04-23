import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import sendEmail from "@/functions/sendEmail.js";
import getEmailContent from "@/helpers/getEmailContent.js";
import getUserInfo from "@/functions/getUserInfo.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { text, screenShots = [] } = req.body;

  if (!text || !Array.isArray(screenShots)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await getUserInfo({ userId: req.userId, projection: { email: 1 } });
    let { body: html } = await getEmailContent({ emailType: "feedback", accessToken: null });
    let updatedHtml = html.replace("{{feedback}}", text);
    updatedHtml = html.replace("{{userId}}", req.userId);

    if (screenShots && screenShots.length > 0) {
      const images = screenShots
        .map((url) => `<img src=${url} style="width: 768px; height: 768px; object-fit: contain" alt=""/>`)
        .join("\n");

      updatedHtml = updatedHtml.replace("{{images}}", `<div">${images}</div>`);
    } else {
      updatedHtml = updatedHtml.replace("{{images}}", "");
    }

    await sendEmail({
      to: "info@muxout.com",
      subject: `Feedback: ${text.slice(0, 25)}...`,
      replyTo: userInfo.email,
      html: updatedHtml,
    });

    res.status(200).end();
  } catch (err) {
    next(err);
  }
});

export default route;
