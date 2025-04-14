import { Router, NextFunction } from "express";
import aqp, { AqpQuery } from "api-query-params";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get("/", async (req: CustomRequest, res, next: NextFunction) => {
  const { filter, skip } = aqp(req.query as any) as AqpQuery;
  const { ageInterval, part, sex, ethnicity, concern } = filter || {};

  if (!concern) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const pipeline: any = [];

    const filter: { [key: string]: any } = {
      isPublic: true,
      concern,
    };

    if (part) filter.part = part;
    if (sex) filter["demographics.sex"] = sex;
    if (ageInterval) filter["demographics.ageInterval"] = ageInterval;
    if (ethnicity) filter["demographics.ethnicity"] = ethnicity;

    pipeline.push({ $match: filter }, { $sort: { updatedAt: -1 } }, { $skip: skip || 0 }, { $limit: 21 });

    const beforeAfters = await doWithRetries(async () => db.collection("BeforeAfter").aggregate(pipeline).toArray());

    res.status(200).json({ message: beforeAfters });
  } catch (err) {
    next(err);
  }
});

export default route;
