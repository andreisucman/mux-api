import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import validateCode from "@/functions/validateCode.js";
import sendConfirmationCode from "@/functions/sendConfirmationCode.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import invalidateTheCode from "@/functions/invalidateTheCode.js";
import { db } from "@/init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { code, newEmail } = req.body;

    if (!code || !newEmail) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const isAlreadyTaken = await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            email: newEmail,
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { projection: { _id: 1 } }
        )
      );

      if (isAlreadyTaken) {
        res
          .status(200)
          .json({ error: `The ${newEmail} email is already taken` });

        await invalidateTheCode(code);
        return;
      }

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

      const { status, userId, type } = await validateCode(code);

      if (!status) {
        if (type === "expired") {
          res.status(200).json({
            error: `This code has expired. We've just sent a new one to ${email}.`,
          });

          sendConfirmationCode({ userId, email });
        } else {
          res.status(200).json({
            error: "Invalid confirmation code",
          });
        }
        return;
      }

      await doWithRetries(() =>
        db.collection("EmailChange").insertOne({
          userId,
          email,
          newEmail,
          stepOne: true,
          updatedAt: new Date(),
        })
      );
      await invalidateTheCode(code);
      await sendConfirmationCode({ userId: req.userId, email: newEmail });
      res.status(200).end();
    } catch (err) {
      next(httpError(err.message, err.status));
    }
  }
);

export default route;
