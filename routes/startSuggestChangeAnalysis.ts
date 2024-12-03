import { Router, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import suggestChange from "functions/suggestChange.js";
import doWithRetries from "helpers/doWithRetries.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post("/", async (req: CustomRequest, res, next: NextFunction) => {
  const { goal, analysisId, userId, type } = req.body;

  if (!goal || !analysisId || !type) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  let finalUserId = req.userId || userId;

  if (!finalUserId) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await doWithRetries(async () =>
      db
        .collection("User")
        .findOne(
          { _id: new ObjectId(finalUserId) },
          { projection: { latestStyleAnalysis: 1 } }
        )
    );

    const styleAnalysisRecord = await doWithRetries(async () =>
      db.collection("StyleAnalysis").findOne({ _id: new ObjectId(analysisId) })
    );

    if (!styleAnalysisRecord)
      throw httpError(`Style analysis record ${analysisId} is not found`);

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), type: `style-${type}` },
          { $set: { isRunning: true, progress: 1, isError: null } },
          { upsert: true }
        )
    );

    res.status(200).end();

    const { styleName, image } = styleAnalysisRecord;

    const response = await suggestChange({
      userId: userId,
      currentStyle: styleName,
      image,
      styleGoals: goal,
      type,
    });

    await doWithRetries(async () =>
      db
        .collection("StyleAnalysis")
        .updateOne(
          { _id: new ObjectId(analysisId) },
          { $set: { matchSuggestion: response, goal } }
        )
    );

    const { latestStyleAnalysis } = userInfo;

    if (latestStyleAnalysis) {
      const newLatestTypeAnalysis = {
        ...styleAnalysisRecord,
        matchSuggestion: response,
      };

      const newLatestAnalysis = {
        ...latestStyleAnalysis,
        [type]: newLatestTypeAnalysis,
      };

      await doWithRetries(async () =>
        db
          .collection("User")
          .updateOne(
            { _id: new ObjectId(userId) },
            { $set: { latestStyleAnalysis: newLatestAnalysis } }
          )
      );
    }

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), type: `style-${type}` },
          { $set: { isRunning: false, progress: 0, isError: null } }
        )
    );
  } catch (err) {
    await addAnalysisStatusError({
      userId: String(userId),
      type: `style-${type}`,
      message: err.message,
    });
  }
});

export default route;
