import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import { Router, Request, Response, NextFunction } from "express";
import validateCode from "@/functions/validateCode.js";
import doWithRetries from "helpers/doWithRetries.js";
import sendConfirmationCode from "@/functions/sendConfirmationCode.js";
import { db } from "init.js";

const route = Router();

route.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const { code } = req.body;

  if (!code) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const { status, userId, type } = await validateCode(code);

    if (!status) {
      if (type === "expired") {
        const userInfo = await doWithRetries(() =>
          db
            .collection("User")
            .findOne(
              { _id: new ObjectId(userId) },
              { projection: { email: 1 } }
            )
        );

        const { email } = userInfo;

        sendConfirmationCode({ userId, email });

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
      db
        .collection("User")
        .updateOne(
          { _id: new ObjectId(userId) },
          { $set: { emailVerified: status } }
        )
    );

    res.status(200).json({ message: status });
  } catch (err) {
    next(err);
  }
});

export default route;
