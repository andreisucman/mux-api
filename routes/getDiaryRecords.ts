import * as dotenv from "dotenv";
dotenv.config();

import aqp, { AqpQuery } from "api-query-params";
import { ObjectId, Sort } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum } from "types.js";
import { DiaryRecordType } from "@/types/saveDiaryRecordTypes.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";
import { daysFrom } from "@/helpers/utils.js";
import { maskDiaryRow } from "@/helpers/mask.js";
import { filterData } from "@/functions/filterData.js";

const route = Router();

route.get(
  "/:userName?",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { userName } = req.params;
    const { filter, sort, skip } = aqp(req.query as any) as AqpQuery;
    const { dateFrom, dateTo, part } = filter;

    try {
      const filters: { [key: string]: any } = {
        moderationStatus: ModerationStatusEnum.ACTIVE,
      };

      if (userName) {
        filters.userName = userName;
      } else {
        filters.userId = new ObjectId(req.userId);
        filters.deletedOn = { $exists: false };
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

      let diary = (await doWithRetries(async () =>
        db
          .collection("Diary")
          .find(filters)
          .sort((sort as Sort) || { _id: -1 })
          .skip(skip || 0)
          .limit(21)
          .toArray()
      )) as unknown as DiaryRecordType[];

      let response = { priceData: null, data: diary };

      if (userName) {
        if (diary.length) {
          const result = await filterData({
            part,
            array: diary,
            dateKey: "createdAt",
            maskFunction: maskDiaryRow,
            userId: req.userId,
          });

          response.priceData = result.priceData;
          response.data = result.data;
        }
      }

      res.status(200).json({ message: response });
    } catch (err) {
      next(err);
    }
  }
);

export default route;
