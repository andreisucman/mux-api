import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest, ModerationStatusEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";
import { db } from "init.js";
import { ObjectId } from "mongodb";

const route = Router();

route.get(
  "/:analysisId?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { analysisId } = req.params;
    try {
      const filters: { [key: string]: any } = {
        moderationStatus: ModerationStatusEnum.ACTIVE,
      };
      if (analysisId && ObjectId.isValid(analysisId))
        filters._id = new ObjectId(analysisId);

      const foodAnalysisRecord = await doWithRetries(async () =>
        db
          .collection("FoodAnalysis")
          .find(filters)
          .sort({ _id: -1 })
          .next()
      );

      res.status(200).json({ message: foodAnalysisRecord });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
