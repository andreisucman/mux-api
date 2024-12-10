import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import validateCode from "@/functions/validateCode.js";
import invalidateTheCode from "@/functions/invalidateTheCode.js";
import sendConfirmationCode from "@/functions/sendConfirmationCode.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { code, newEmail } = req.body;

    try {
      const { status, userId, type } = await validateCode(code);

      if (!status) {
        if (type === "expired") {
          res.status(200).json({
            error: `This code has expired. We've just sent a new one to ${newEmail}.`,
          });

          sendConfirmationCode({ userId, email: newEmail });
        } else {
          res.status(200).json({
            error: "Invalid confirmation code",
          });
        }
        return;
      }

      const emailChangeRecord = await doWithRetries(() =>
        db.collection("EmailChange").findOne({
          userId,
          newEmail,
          stepOne: true,
        })
      );

      if (!emailChangeRecord)
        throw httpError(
          `No email change record for user ${req.userId} and email ${newEmail}`
        );

      await doWithRetries(async () =>
        db
          .collection("User")
          .updateOne(
            { _id: new ObjectId(userId) },
            { $set: { email: newEmail, emailVerified: true } }
          )
      );

      invalidateTheCode(code);

      res.status(200).json({ message: `Email changed to ${newEmail}.` });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
