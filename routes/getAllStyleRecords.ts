import { Router, NextFunction } from "express";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get("/", async (req: CustomRequest, res, next: NextFunction) => {
  const { type, styleName, skip, sex, ageInterval, ethnicity } = req.query;

  try {
    const filter: { [key: string]: any } = {};

    if (type) filter.type = type;
    if (styleName) filter.styleName = styleName;
    if (sex) filter.demographics["sex"] = sex;
    if (ageInterval) filter.demographics["ageInterval"] = ageInterval;
    if (ethnicity) filter.demographics["ethnicity"] = ethnicity;

    const projection: { [key: string]: any } = {
      _id: 1,
      userId: 1,
      styleIcon: 1,
      styleName: 1,
      isPublic: 1,
      mainUrl: 1,
      initialMainUrl: 1,
      urls: 1,
      analysis: 1,
      initialAnalysis: 1,
      createdAt: 1,
      likes: 1,
      initialLikes: 1,
    };

    const styles = await doWithRetries({
      functionName: "getAllStyleRecords",
      functionToExecute: async () =>
        await db
          .collection("StyleAnalysis")
          .find(filter, {
            projection,
          })
          .sort({ createdAt: -1 })
          .skip(Number(skip) || 0)
          .limit(21)
          .toArray(),
    });

    res.status(200).json({ message: styles });
  } catch (err) {
    next(err);
  }
});

export default route;
