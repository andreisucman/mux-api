import doWithRetries from "@/helpers/doWithRetries.js";
import { UserConcernType } from "@/types.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "@/types.js";
import updateConcernsAnalytics from "../functions/updateConcernsAnalytics.js";
import { validParts } from "@/data/other.js";
import getUserInfo from "@/functions/getUserInfo.js";

type Props = {
  name: string;
  part: string;
  isDisabled: boolean;
};

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { name, part, isDisabled }: Props = req.body;

    if (!validParts.includes(part)) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    try {
      const userInfo = await getUserInfo({
        userId: req.userId,
        projection: { concerns: 1 },
      });

      const updatedConcerns = userInfo.concerns.map((cobj: UserConcernType) =>
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
      next(err);
    }
  }
);

export default route;
