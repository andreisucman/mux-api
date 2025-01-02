import { Router, NextFunction } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import aqp from "api-query-params";
import { ModerationStatusEnum } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get("/", async (req: CustomRequest, res, next: NextFunction) => {
  const { filter, skip } = aqp(req.query);
  const { type, styleName, sex, ageInterval, ethnicity } = filter;

  try {
    const filter: { [key: string]: any } = {
      isPublic: true,
      moderationStatus: ModerationStatusEnum.ACTIVE,
    };

    if (type) filter.type = type;
    if (styleName) filter.styleName = styleName;
    if (sex) filter.demographics.sex = sex;
    if (ageInterval) filter.demographics.ageInterval = ageInterval;
    if (ethnicity) filter.demographics.ethnicity = ethnicity;

    const projection: { [key: string]: any } = {
      _id: 1,
      userId: 1,
      styleIcon: 1,
      styleName: 1,
      isPublic: 1,
      mainUrl: 1,
      compareMainUrl: 1,
      compareStyleName: 1,
      urls: 1,
      compareUrls: 1,
      analysis: 1,
      initialAnalysis: 1,
      createdAt: 1,
      compareDate: 1,
      votes: 1,
      userName: 1,
      avatar: 1,
      compareVotes: 1,
    };

    const styles = await doWithRetries(
      async () =>
        await db
          .collection("StyleAnalysis")
          .find(filter, {
            projection,
          })
          .sort({ createdAt: -1 })
          .skip(Number(skip) || 0)
          .limit(21)
          .toArray()
    );

    res.status(200).json({ message: styles });
  } catch (err) {
    next(err);
  }
});

export default route;
