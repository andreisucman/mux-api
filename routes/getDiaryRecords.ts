import * as dotenv from "dotenv";
dotenv.config();

import aqp from "api-query-params";
import { ObjectId, Sort } from "mongodb";
import { Router, Response, NextFunction } from "express";
import checkTrackedRBAC from "@/functions/checkTrackedRBAC.js";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum, PrivacyType } from "types.js";
import { DiaryRecordType } from "@/types/saveDiaryRecordTypes.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get(
  "/:userName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userName } = req.params;
    const { sort, skip } = aqp(req.query);

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

      let results = (await doWithRetries(async () =>
        db
          .collection("Diary")
          .find(filters)
          .sort((sort as Sort) || { createdAt: -1 })
          .skip(skip || 0)
          .project(projection)
          .limit(21)
          .toArray()
      )) as unknown as DiaryRecordType[];

      if (userName) {
        const categoriesToExclude = privacy
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
