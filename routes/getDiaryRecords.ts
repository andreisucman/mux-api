import * as dotenv from "dotenv";
dotenv.config();

import aqp, { AqpQuery } from "api-query-params";
import { ObjectId, Sort } from "mongodb";
import { Router, Response, NextFunction } from "express";
import checkRbac from "@/functions/checkRbac.js";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum } from "types.js";
import { DiaryRecordType } from "@/types/saveDiaryRecordTypes.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";
import { daysFrom } from "@/helpers/utils.js";

const route = Router();

route.get(
  "/:userName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userName } = req.params;
    const { filter, sort, skip } = aqp(req.query as any) as AqpQuery;
    const { dateFrom, dateTo, part } = filter;

    try {
      // if (userName) {
      //   const { inClub, isSelf, isFollowing } = await checkRbac({
      //     followingUserName: userName,
      //     userId: req.userId,
      //     throwOnError: false,
      //   });

      //   if ((!inClub || !isFollowing) && !isSelf) {
      //     res.status(200).json({ message: [] });
      //     return;
      //   }
      // }

      const filters: { [key: string]: any } = {
        moderationStatus: ModerationStatusEnum.ACTIVE,
      };

      const projection = { collageImage: 0 };

      if (userName) {
        filters.userName = userName;
      } else {
        filters.userId = new ObjectId(req.userId);
      }

      if (part) {
        filters.part = part;
      }

      if (dateFrom && dateTo) {
        filters.$and = [
          { createdAt: { $gte: dateFrom } },
          { createdAt: { $lte: daysFrom({ date: dateTo, days: 1 }) } },
        ];
      }

      let results = (await doWithRetries(async () =>
        db
          .collection("Diary")
          .find(filters)
          .sort((sort as Sort) || { _id: -1 })
          .skip(skip || 0)
          .project(projection)
          .limit(21)
          .toArray()
      )) as unknown as DiaryRecordType[];

      res.status(200).json({ message: results });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
