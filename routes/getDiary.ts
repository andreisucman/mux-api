import * as dotenv from "dotenv";
dotenv.config();

import aqp, { AqpQuery } from "api-query-params";
import { ObjectId, Sort } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum } from "types.js";
import { DiaryType } from "@/types/saveDiaryRecordTypes.js";
import { CustomRequest } from "types.js";
import { daysFrom } from "@/helpers/utils.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:userName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userName } = req.params;
    const { filter, sort, skip } = aqp(req.query as any) as AqpQuery;
    const { dateFrom, dateTo, part, concern } = filter;

    try {
      let diary = [];

      let finalFilters: { [key: string]: any } = {
        moderationStatus: ModerationStatusEnum.ACTIVE,
        deletedOn: { $exists: false },
      };

      if (userName) {
        finalFilters.userName = userName;
        finalFilters.isPublic = true;
      } else {
        if (req.userId) finalFilters.userId = new ObjectId(req.userId);
      }

      if (concern) finalFilters.concern = concern;
      if (part) finalFilters.part = part;

      if (dateFrom && dateTo) {
        finalFilters.$and = [
          { createdAt: { $gte: dateFrom } },
          { createdAt: { $lte: daysFrom({ date: dateTo, days: 1 }) } },
        ];
      }

      diary = await doWithRetries(async () =>
        db
          .collection<DiaryType>("Diary")
          .find(finalFilters)
          .sort((sort as Sort) || { _id: -1 })
          .skip(skip || 0)
          .limit(21)
          .toArray()
      );

      res.status(200).json({
        message: { data: diary },
      });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
