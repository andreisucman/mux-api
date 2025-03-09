import * as dotenv from "dotenv";
dotenv.config();

import aqp, { AqpQuery } from "api-query-params";
import { ObjectId, Sort } from "mongodb";
import { Router, Response, NextFunction } from "express";
import checkTrackedRBAC from "@/functions/checkTrackedRBAC.js";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum, PrivacyType } from "types.js";
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
    const { dateFrom, dateTo } = filter;

    try {
      let privacy: PrivacyType[] = [];

      if (userName) {
        const { inClub, isSelf, isFollowing, targetUserInfo } =
          await checkTrackedRBAC({
            followingUserName: userName,
            userId: req.userId,
            throwOnError: false,
            targetProjection: { club: 1 },
          });

        if ((!inClub || !isFollowing) && !isSelf) {
          res.status(200).json({ message: [] });
          return;
        }

        privacy = targetUserInfo.club.privacy;
      }

      const filters: { [key: string]: any } = {
        moderationStatus: ModerationStatusEnum.ACTIVE,
      };

      const projection = { collageImage: 0 };

      if (userName) {
        filters.userName = userName;
      } else {
        filters.userId = new ObjectId(req.userId);
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

      if (userName) {
        const relevantPrivacy = privacy.find((p) => p.name === "proof");

        const categoriesToExclude = relevantPrivacy.parts
          .filter((ob) => !ob.value)
          .map((r) => r.name);

        if (categoriesToExclude.length > 0) {
          results = results.map((r) => {
            return {
              ...r,
              activity: r.activity.filter(
                (a) => !categoriesToExclude.includes(a.categoryName)
              ),
            };
          });
        }
      }

      res.status(200).json({ message: results });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
