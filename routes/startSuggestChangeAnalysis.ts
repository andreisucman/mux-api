import { Router, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { db } from "init.js";
import { CategoryNameEnum, CustomRequest } from "types.js";
import suggestChange from "functions/suggestChange.js";
import doWithRetries from "helpers/doWithRetries.js";
import { StyleAnalysisType } from "types.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import httpError from "@/helpers/httpError.js";
import { ModerationStatusEnum } from "types.js";
import getUserInfo from "@/functions/getUserInfo.js";
import checkAndRecordTwin from "@/functions/checkAndRecordTwin.js";

const route = Router();

route.post("/", async (req: CustomRequest, res, next: NextFunction) => {
  const { goalStyle, analysisId, userId, type } = req.body;

  if (!goalStyle || !analysisId || !type) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  let finalUserId = req.userId || userId; // userId is necessary if the user is not registered

  if (!finalUserId) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const userInfo = await getUserInfo({
      userId: finalUserId,
      projection: { latestStyleAnalysis: 1 },
    });

    const styleAnalysisRecord = (await doWithRetries(async () =>
      db.collection("StyleAnalysis").findOne({
        _id: new ObjectId(analysisId),
        moderationStatus: ModerationStatusEnum.ACTIVE,
      })
    )) as unknown as StyleAnalysisType | null;

    if (!styleAnalysisRecord)
      next(httpError(`Style analysis record ${analysisId} is not found`));

    const { styleName, mainUrl } = styleAnalysisRecord;

    const { mustLogin, isSuspended, errorMessage } = await checkAndRecordTwin({
      image: mainUrl.url,
      payloadUserId: userId,
      requestUserId: req.userId,
      registryFilter: { type, category: "style" },
      categoryName: CategoryNameEnum.STYLESCAN,
    });

    if (errorMessage) {
      res.status(200).json({
        error: errorMessage,
      });
      return;
    }

    if (isSuspended) {
      res.status(200).json({
        error:
          "You can't use the platform for violating our TOS in the past. If you think this is a mistake contact us at info@muxout.com.",
      });
      return;
    }

    if (mustLogin) {
      res.status(200).json({ error: "must login" });
      return;
    }

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: `style-${type}` },
          { $set: { isRunning: true, progress: 1, isError: null } },
          { upsert: true }
        )
    );

    res.status(200).end();

    const response = await suggestChange({
      userId: userId,
      currentStyle: styleName,
      image: mainUrl.url,
      styleGoals: goalStyle,
      categoryName: CategoryNameEnum.STYLESCAN,
      type,
    });

    await doWithRetries(async () =>
      db
        .collection("StyleAnalysis")
        .updateOne(
          { _id: new ObjectId(analysisId) },
          { $set: { matchSuggestion: response, goalStyle } }
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
        db.collection("User").updateOne(
          {
            _id: new ObjectId(userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { $set: { latestStyleAnalysis: newLatestAnalysis } }
        )
      );
    }

    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), operationKey: `style-${type}` },
          { $set: { isRunning: false, progress: 0, isError: null } }
        )
    );
  } catch (err) {
    await addAnalysisStatusError({
      userId: String(userId),
      operationKey: `style-${type}`,
      message:
        "An unexpected error occured. Please try again and inform us if the error persists.",
      originalMessage: err.message,
    });
    next(httpError(err.message, err.status));
  }
});

export default route;
