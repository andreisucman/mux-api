import { Router, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { db } from "init.js";
import { CustomRequest, StyleAnalysisType, PrivacyType } from "types.js";
import analyzeStyle from "functions/analyzeStyle.js";
import { outlookStyles } from "@/data/outlookStyles.js";
import { createHashKey } from "functions/createHashKey.js";
import doWithRetries from "helpers/doWithRetries.js";
import getReadyBlurredUrls from "functions/getReadyBlurredUrls.js";
import getScoreDifference from "@/helpers/getScoreDifference.js";
import getStyleCompareRecord from "functions/getStyleCompareRecord.js";
import { StartStyleAnalysisUserInfoType } from "types/startStyleAnalysisTypes.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { image, type, blurType, localUserId } = req.body;

    let userId = req.userId || localUserId;
    if (!userId) userId = String(new ObjectId());

    try {
      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(userId), operationKey: `style-${type}` },
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
              name: 1,
              avatar: 1,
              latestStyleAnalysis: 1,
              latestScoresDifference: 1,
              demographics: 1,
              "club.privacy": 1,
            },
          }
        )
      )) as unknown as StartStyleAnalysisUserInfoType;

      const {
        club,
        name,
        avatar,
        latestStyleAnalysis,
        latestScoresDifference,
      } = userInfo || {
        club: {},
        latestStyleAnalysis: {},
      };

      const { privacy } = club || {};

      const styleAnalysisResponse = await analyzeStyle({
        userId,
        image,
        type,
      });

      const {
        explanation: currentDescription,
        suggestion: currentSuggestion,
        styleName,
        scores,
      } = styleAnalysisResponse;

      const existingTypeAnaysis = latestStyleAnalysis?.[type as "head"];
      const { _id, ...restExisting } = existingTypeAnaysis || {};

      let mainUrl = { name: "original" as "original", url: image };
      let urls = [mainUrl];

      if (blurType && blurType !== "original") {
        const blurredResponse = await getReadyBlurredUrls({
          url: image,
          blurType,
        });

        mainUrl = blurredResponse.mainUrl;
        urls = blurredResponse.urls;
      }

      const compareStyleRecord = await getStyleCompareRecord({ userId });
      const {
        mainUrl: compareMainUrl,
        urls: compareUrls,
        styleName: compareStyleName,
        analysis: compareAnalysis,
        createdAt: compareDate,
      } = compareStyleRecord || {};

      const hash = await createHashKey(image);
      const relevantStyleObject = outlookStyles.find(
        (s) => s.name === styleName
      );

      const styleAnalysis: StyleAnalysisType = {
        _id: new ObjectId(),
        userId: new ObjectId(userId),
        ...restExisting,
        demographics: userInfo.demographics,
        latestHeadScoreDifference: 0,
        latestBodyScoreDifference: 0,
        goal: null,
        type,
        hash,
        mainUrl,
        urls,
        styleIcon: relevantStyleObject.icon,
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
        isBlocked: false,
        userName: name,
        avatar,
        votes: 0,
      };

      if (privacy) {
        const relevantTypePrivacy = privacy.find(
          (typePrivacyObj: PrivacyType) => typePrivacyObj.name === type
        );

        if (relevantTypePrivacy) {
          const somePartEnabled = relevantTypePrivacy.parts.some(
            (partPrivacyObj: { value: boolean }) =>
              Boolean(partPrivacyObj.value)
          );

          if (somePartEnabled) {
            styleAnalysis.isPublic = somePartEnabled;
          }
        }
      }

      if (userInfo) {
        const { latestBodyScoreDifference, latestHeadScoreDifference } =
          getScoreDifference({ latestScoresDifference, privacy });

        styleAnalysis.latestHeadScoreDifference = latestHeadScoreDifference;
        styleAnalysis.latestBodyScoreDifference = latestBodyScoreDifference;

        const newLatestAnalysis = {
          ...latestStyleAnalysis,
          [type]: styleAnalysis,
        };

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
        db.collection("StyleAnalysis").insertOne(styleAnalysis)
      );

      await doWithRetries(async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(userId), operationKey: `style-${type}` },
            { $set: { isRunning: false, progress: 0, isError: null } }
          )
      );
    } catch (error) {
      await addAnalysisStatusError({
        userId: String(userId),
        operationKey: `style-${type}`,
        message: error.message,
      });
      next(error);
    }
  }
);

export default route;
