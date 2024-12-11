import { Router, NextFunction } from "express";
import aqp from "api-query-params";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get("/", async (req: CustomRequest, res, next: NextFunction) => {
  const { filter, skip } = aqp(req.query);
  const { ageInterval, type, part, sex, bodyType, ethnicity, concern } =
    filter || {};

  try {
    const pipeline: any = [];

    const match = { $match: {} };

    const filter: { [key: string]: any } = {
      isPublic: true,
    };

    if (sex) filter["demographics.sex"] = sex;
    if (bodyType) filter["demographics.bodyType"] = bodyType;
    if (ageInterval) filter["demographics.ageInterval"] = ageInterval;
    if (ethnicity) filter["demographics.ethnicity"] = ethnicity;
    if (concern) filter["concerns.name"] = concern;
    if (type) filter.type = type;
    if (part) filter.part = part;

    match.$match = { ...match.$match, ...filter };

    pipeline.push(
      match,
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
