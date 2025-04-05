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
import getPurchasedFilters from "@/functions/getPurchasedFilters.js";
import { maskDiaryRow } from "@/helpers/mask.js";

const route = Router();

route.get("/:userName?", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { userName } = req.params;
  const { filter, sort, skip } = aqp(req.query as any) as AqpQuery;
  const { dateFrom, dateTo, part } = filter;

  try {
    let purchases = [];
    let diary = [];
    let notPurchased = [];
    let priceData = [];

    let finalFilters: { [key: string]: any } = {
      moderationStatus: ModerationStatusEnum.ACTIVE,
    };

    if (userName) {
      finalFilters.userName = userName;

      const response = await getPurchasedFilters({
        userId: req.userId,
        userName,
        part: filter.part,
      });
      purchases = response.purchases;
      priceData = response.priceData;
      notPurchased = response.notPurchased;
      finalFilters = { ...finalFilters, ...response.additionalFilters };
    } else {
      if (req.userId) {
        finalFilters.userId = new ObjectId(req.userId);
        finalFilters.deletedOn = { $exists: false };
      } else {
        finalFilters.isPublic = true;
        finalFilters.deletedOn = { $exists: false };
      }
    }

    if (part) {
      finalFilters.part = part;
    }

    if (dateFrom && dateTo) {
      finalFilters.$and = [
        { createdAt: { $gte: dateFrom } },
        { createdAt: { $lte: daysFrom({ date: dateTo, days: 1 }) } },
      ];
    }

    diary = (await doWithRetries(async () =>
      db
        .collection("Diary")
        .find(finalFilters)
        .sort((sort as Sort) || { _id: -1 })
        .skip(skip || 0)
        .limit(21)
        .toArray()
    )) as unknown as DiaryRecordType[];

    if (!purchases.length && userName) diary = diary.map((r) => maskDiaryRow(r as DiaryRecordType));

    res.status(200).json({
      message: { data: diary, purchases, notPurchased, priceData },
    });
  } catch (err) {
    next(err);
  }
});

export default route;
