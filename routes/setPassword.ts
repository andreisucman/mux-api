import * as dotenv from "dotenv";
dotenv.config();
import bcrypt from "bcrypt";
import { ObjectId } from "mongodb";
import { Router, Request, Response, NextFunction } from "express";
import validateCode from "@/functions/validateCode.js";
import invalidateTheCode from "@/functions/invalidateTheCode.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";
import { ModerationStatusEnum } from "@/types.js";

const route = Router();

route.post("/", async (req: Request, res: Response, next: NextFunction) => {
  const { accessToken, password } = req.body;

  if (!accessToken) {
    res.status(400).json({ message: "Bad request" });
    return;
  }

  if (!password) {
    res.status(200).json({ error: "Please provide a password." });
    return;
  }

  try {
    const { status, userId, type } = await validateCode(accessToken);

    if (!status) {
      res.status(200).json({ error: type });
      return;
    }

    const hashedPassword = password
      ? await bcrypt.hash(password, 10)
      : undefined;

    const updateObject = {
      $set: { password: hashedPassword },
    };

    await doWithRetries(async () =>
      db.collection("User").updateOne(
        {
          _id: new ObjectId(userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        updateObject
      )
    );

    invalidateTheCode(accessToken);

    res.status(200).json({ message: "Password changed" });
  } catch (err) {
    next(err);
  }
});

export default route;
