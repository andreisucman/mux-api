import { Router, NextFunction } from "express";
import aqp, { AqpQuery } from "api-query-params";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get("/", async (req: CustomRequest, res, next: NextFunction) => {
  const { filter, skip } = aqp(req.query as any) as AqpQuery;
  const { ageInterval, part, sex, bodyType, ethnicity, concern } = filter || {};

  try {
    const pipeline: any = [];

    const filter: { [key: string]: any } = {
      isPublic: true,
    };

    if (concern) filter.concerns.name = concern;
    if (part) filter.part = part;

    const demographics: { [key: string]: any } = {};

    if (sex) demographics.sex = sex;
    if (bodyType) demographics.bodyType = bodyType;
    if (ageInterval) demographics.ageInterval = ageInterval;
    if (ethnicity) demographics.ethnicity = ethnicity;

    if (Object.keys(demographics).length > 0)
      filter.demographics = demographics;

    pipeline.push(
      { $match: filter },
      { $sort: { updatedAt: -1 } },
      { $skip: skip || 0 },
      { $limit: 21 }
    );

    const beforeAfters = await doWithRetries(async () =>
      db.collection("BeforeAfter").aggregate(pipeline).toArray()
    );

    res.status(200).json({ message: beforeAfters });
  } catch (err) {
    next(err);
  }
});

export default route;
