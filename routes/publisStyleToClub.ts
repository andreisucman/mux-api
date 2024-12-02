import { Router, Response } from "express";
import { ObjectId } from "mongodb";
import { db } from "init.js";
import { CustomRequest } from "types.js";
import moderateImages from "functions/moderateImages.js";
import doWithRetries from "helpers/doWithRetries.js";
import addErrorLog from "functions/addErrorLog.js";
import { PublishToClubUserInfoType } from "types/pubishStyleToClubTypes.js";

const route = Router();

route.post("/", async (req: CustomRequest, res: Response) => {
  const { styleAnalysisId } = req.body;

  try {
    if (!req.userId) {
      res.status(400).json({ error: "Bad request" });
      return;
    }

    const userInfo = (await doWithRetries({
      functionName: "publishStyleToClub - find the user",
      functionToExecute: async () =>
        db.collection("User").findOne(
          { _id: new ObjectId(req.userId) },
          {
            projection: {
              club: 1,
              "demographics.sex": 1,
              latestStyleAnalysis: 1,
              latestProgress: 1,
              "latestScoresDifference.head.overall": 1,
              "latestScoresDifference.body.overall": 1,
            },
          }
        ),
    })) as unknown as PublishToClubUserInfoType;

    const { club, latestScoresDifference } = userInfo || {
      club: {},
    };
    const { isActive } = club || {};
    const { head: headScoreDifference, body: bodyScoreDifference } =
      latestScoresDifference || {};

    if (!isActive) {
      res.status(200).json({ error: "You need to join the Club first" });
      return;
    }

    const relevantStyle = await doWithRetries({
      functionName: "pubishStyleToClub - get existing analysis",
      functionToExecute: async () =>
        db.collection("StyleAnalysis").findOne(
          {
            _id: new ObjectId(styleAnalysisId),
            userId: new ObjectId(req.userId),
          },
          { projection: { image: 1, type: 1, isPublic: 1 } }
        ),
    });

    if (!relevantStyle) {
      throw new Error("relevantStyle not found");
    }

    const { image, isPublic } = relevantStyle;

    if (isPublic) {
      res.status(200).json({ error: "This photo has already been published" });
      return;
    }

    const { latestProgress } = userInfo;
    const { head } = latestProgress;
    const { face } = head;

    const userImage = face.images.find(
      (imageObj) => imageObj.position === "front"
    ).mainUrl.url;

    const moderationResponse = await moderateImages({
      userId: String(userInfo._id),
      userImage,
      allowOnlyUser: true,
      image,
    });

    if (!moderationResponse.status) {
      res.status(200).json({ error: moderationResponse.message });
      return;
    }

    const { type } = relevantStyle;
    const { privacy } = club;

    const relevantPrivacyType = privacy.find(
      (typePrivacy) => typePrivacy.name === type
    );

    if (!relevantPrivacyType.value) {
      res.status(200).json({
        error: `You need to enable the ${type} data sharing in the club settings to be able to publish to Club.`,
      });
      return;
    }

    await doWithRetries({
      functionName: "publishStyleToClub - update style analysis",
      functionToExecute: async () =>
        db.collection("StyleAnalysis").updateOne(
          { _id: new ObjectId(styleAnalysisId) },
          {
            $set: {
              isPublic: true,
              clubName: club.name,
              avatar: club.avatar,
              latestHeadScoreDifference: headScoreDifference.overall,
              latestBodyScoreDifference: bodyScoreDifference.overall,
            },
          }
        ),
    });

    res.status(200).end();
  } catch (error) {
    addErrorLog({
      functionName: "publishStyleToClub",
      message: error.message,
    });
    res.status(500).json({ error: "Unexpected error" });
  }
});

export default route;
