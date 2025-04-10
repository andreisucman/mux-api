import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import validateCode from "@/functions/validateCode.js";
import doWithRetries from "helpers/doWithRetries.js";
import sendConfirmationCode from "@/functions/sendConfirmationCode.js";
import invalidateTheCode from "@/functions/invalidateTheCode.js";
import { db } from "init.js";
import { CustomRequest, ModerationStatusEnum } from "@/types.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { code } = req.body;

  if (!code) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const { status, type } = await validateCode(code);

    if (!status) {
      if (type === "expired") {
        const userInfo = await doWithRetries(() =>
          db.collection("User").findOne(
            {
              _id: new ObjectId(req.userId),
              moderationStatus: ModerationStatusEnum.ACTIVE,
            },
            { projection: { email: 1 } }
          )
        );

        const { email } = userInfo;

        sendConfirmationCode({ userId: req.userId, email });

        res.status(200).json({
          error: `This code has expired. We've just sent a new one to ${email}.`,
        });
      } else {
        res.status(200).json({
          error: "Invalid confirmation code",
        });
      }
      return;
    }

    await doWithRetries(async () =>
      db.collection("User").updateOne({ _id: new ObjectId(req.userId) }, { $set: { emailVerified: status } })
    );

    invalidateTheCode(code);

    res.status(200).json({ message: status });
  } catch (err) {
    next(err);
  }
});

export default route;
