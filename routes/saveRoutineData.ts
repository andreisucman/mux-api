import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { db } from "init.js";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import checkTextSafety from "@/functions/checkTextSafety.js";
import { SuspiciousRecordCollectionEnum } from "@/functions/addSuspiciousRecord.js";
import updateContent from "@/functions/updateContent.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { status, part, name, description, price, updatePrice } = req.body;

    console.log("req.body", req.body);
    if (
      Number(price) < 1 ||
      Number(updatePrice) < 1 ||
      isNaN(Number(price)) ||
      isNaN(Number(updatePrice)) ||
      name.length > 50 ||
      description.length > 150
    ) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      for (const text of [name, description]) {
        const isSafe = await checkTextSafety({
          userId: req.userId,
          text,
          collection: SuspiciousRecordCollectionEnum.ROUTINE_DATA,
        });

        if (!isSafe) {
          res.status(200).json({
            error:
              "It appears that your text contains profanity. Please revise and try again.",
          });
          return;
        }
      }

      await doWithRetries(async () =>
        db.collection("RoutineData").updateOne(
          { userId: new ObjectId(req.userId), part },
          {
            $set: {
              status,
              name,
              description,
              price,
              updatePrice,
            },
          },
          { upsert: true }
        )
      );

      res.status(200).end();

      await updateContent({
        userId: req.userId,
        collections: ["BeforeAfter", "Progress", "Proof", "Diary", "Routine"],
        part,
        updatePayload: { isPublic: status === "public" },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
