import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:analysisId",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { analysisId } = req.params;

    try {
      if (!analysisId || !ObjectId.isValid(analysisId)) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const foodAnalysisRecord = await doWithRetries(async () =>
        db
          .collection("FoodAnalysis")
          .findOne({
            _id: new ObjectId(analysisId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          })
      );

      res.status(200).json({ message: foodAnalysisRecord });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
