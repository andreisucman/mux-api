import doWithRetries from "@/helpers/doWithRetries.js";
import { UserConcernType } from "@/types.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "@/types.js";
import updateConcernsAnalytics from "../functions/updateConcernsAnalytics.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  name: string;
  part: string;
  isDisabled: boolean;
};

const route = Router();

const allowedParts = ["face", "scalp", "mouth", "body", "health"];

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { name, part, isDisabled }: Props = req.body;

    if (!allowedParts.includes(part)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const currentConcerns = await doWithRetries(async () =>
        db
          .collection("User")
          .findOne(
            { _id: new ObjectId(req.userId) },
            { projection: { concerns: 1 } }
          )
      );

      const updatedConcerns = currentConcerns.map((cobj: UserConcernType) =>
        cobj.name === name ? { ...cobj, isDisabled } : cobj
      );

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          { _id: new ObjectId(req.userId) },
          {
            $set: { concerns: updatedConcerns },
          }
        )
      );

      updateConcernsAnalytics({
        concerns: [{ name, part, isDisabled }],
        userId: req.userId,
      });

      res.status(200).end();
    } catch (err) {
      next(httpError(err.message, err.status));
    }
  }
);

export default route;
