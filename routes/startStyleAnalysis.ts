import { Router, Response } from "express";
import { ObjectId } from "mongodb";
import { db } from "init.js";
import { CustomRequest, StyleAnalysisType, PrivacyType } from "types.js";
import analyzeStyle from "functions/analyzeStyle.js";
import { createHashKey } from "functions/createHashKey.js";
import doWithRetries from "helpers/doWithRetries.js";
import getReadyBlurredUrls from "functions/getReadyBlurredUrls.js";
import getStyleCompareRecord from "functions/getStyleCompareRecord.js";
import { StartStyleAnalysisUserInfoType } from "types/startStyleAnalysisTypes.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  const { image, type, blurType, localUserId } = req.body;

  let userId = req.userId || localUserId;
  if (!userId) userId = String(new ObjectId());

  try {
    await doWithRetries(async () =>
      db
        .collection("AnalysisStatus")
        .updateOne(
          { userId: new ObjectId(userId), type: `style-${type}` },
          { $set: { isRunning: true, progress: 1, isError: null } },
          { upsert: true }
        )
    );

    res.status(200).json({ message: userId });

    const userInfo = (await doWithRetries(async () =>
      db.collection("User").findOne(
        { _id: new ObjectId(req.userId) },
        {
          projection: {
            latestStyleAnalysis: 1,
            latestScoresDifference: 1,
            demographics: 1,
            "club.name": 1,
            "club.avatar": 1,
            "club.privacy": 1,
          },
        }
      )
    )) as unknown as StartStyleAnalysisUserInfoType;

    const { club, latestStyleAnalysis, latestScoresDifference } = userInfo || {
      club: {},
      latestStyleAnalysis: {},
    };

    const { privacy } = club || {};

    const {
      explanation: currentDescription,
      suggestion: currentSuggestion,
      styleName,
      scores,
    } = await analyzeStyle({
      userId,
      image,
      type,
    });

    const existingTypeAnaysis = latestStyleAnalysis?.[type as "head"];
    const { _id, ...restExisting } = existingTypeAnaysis || {};

    const { mainUrl, urls } = await getReadyBlurredUrls({
      url: image,
      blurType,
    });

    const compareStyleRecord = await getStyleCompareRecord({ userId });
    const {
      mainUrl: compareMainUrl,
      urls: compareUrls,
      styleName: compareStyleName,
      analysis: compareAnalysis,
      createdAt: compareDate,
    } = compareStyleRecord || {};

    const hash = await createHashKey(image);

    const styleAnalysis: StyleAnalysisType = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      ...restExisting,
      demographics: userInfo.demographics,
      latestHeadScoreDifference: latestScoresDifference?.head?.overall || 0,
      latestBodyScoreDifference: latestScoresDifference?.body?.overall || 0,
      goal: null,
      type,
      hash,
      mainUrl,
      urls,
      styleName,
      createdAt: new Date(),
      analysis: scores,
      compareMainUrl: compareMainUrl || mainUrl,
      compareDate: compareDate || new Date(),
      compareUrls: compareUrls || urls,
      compareStyleName: compareStyleName || styleName,
      compareVotes: 0,
      compareAnalysis: compareAnalysis || scores,
      currentDescription,
      currentSuggestion,
      matchSuggestion: null as string,
      isPublic: false,
      clubName: club.name,
      avatar: club.avatar,
      votes: 0,
    };

    const relevantTypePrivacy = privacy?.find(
      (typePrivacyObj: PrivacyType) => typePrivacyObj.name === type
    );

    const somePartEnabled = relevantTypePrivacy?.parts?.some(
      (partPrivacyObj: { value: boolean }) => Boolean(partPrivacyObj.value)
    );

    if (somePartEnabled) {
      styleAnalysis.isPublic = somePartEnabled;
    }

    await doWithRetries(async () =>
      db.collection("StyleAnalysis").insertOne(styleAnalysis)
    );

    if (userInfo) {
      const newLatestAnalysis: {
        head?: StyleAnalysisType;
        body?: StyleAnalysisType;
      } = {
        ...latestStyleAnalysis,
        [type]: styleAnalysis,
      };

      if (req.userId)
        await doWithRetries(async () =>
          db
            .collection("User")
            .updateOne(
              { _id: new ObjectId(req.userId) },
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
  } catch (error) {
    await addAnalysisStatusError({
      userId: String(userId),
      type: `style-${type}`,
      message: error.message,
    });
  }
});

export default route;
