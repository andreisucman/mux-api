import doWithRetries from "@/helpers/doWithRetries.js";
import { UserConcernType } from "@/types.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "@/types.js";
import updateConcernsAnalytics from "../functions/updateConcernsAnalytics.js";

type Props = {
  key: string;
  part: string;
  isDisabled: boolean;
};

const route = Router();

const allowedParts = ["face", "scalp", "mouth", "body", "health"];

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { key, part, isDisabled }: Props = req.body;

    if (!allowedParts.includes(part)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const currentConcerns = await doWithRetries(async () =>
        db
          .collection("User")
          .findOne(
            { userId: new ObjectId(req.userId) },
            { projection: { concerns: 1 } }
          )
      );

      const updatedConcerns = currentConcerns.map((cobj: UserConcernType) =>
        cobj.key === key ? { ...cobj, isDisabled } : cobj
      );

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          { userId: new ObjectId(req.userId) },
          {
            $set: { concerns: updatedConcerns },
          }
        )
      );

      updateConcernsAnalytics([{ key, part, isDisabled }]);

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
