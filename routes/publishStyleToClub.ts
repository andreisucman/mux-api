import { Router, Response, NextFunction } from "express";
import { ObjectId } from "mongodb";
import { db } from "init.js";
import { CategoryNameEnum, CustomRequest } from "types.js";
import { ModerationStatusEnum } from "types.js";
import checkIfSelf from "@/functions/checkIfSelf.js";
import doWithRetries from "helpers/doWithRetries.js";
import { PublishToClubUserInfoType } from "types/pubishStyleToClubTypes.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { styleAnalysisId } = req.body;

    try {
      if (!styleAnalysisId) {
        res.status(400).json({ error: "Bad request" });
        return;
      }

      const userInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            projection: {
              name: 1,
              avatar: 1,
              "club.payouts": 1,
              "club.privacy": 1,
              "demographics.sex": 1,
              latestStyleAnalysis: 1,
              latestProgress: 1,
            },
          }
        )
      )) as unknown as PublishToClubUserInfoType;

      const { club } = userInfo || {};
      const { payouts } = club || {};
      const { detailsSubmitted } = payouts || {};

      if (!detailsSubmitted) {
        res.status(200).json({ error: "You need to join the Club first." });
        return;
      }

      const relevantStyle = await doWithRetries(async () =>
        db.collection("StyleAnalysis").findOne(
          {
            _id: new ObjectId(styleAnalysisId),
            userId: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          { projection: { image: 1, type: 1, isPublic: 1 } }
        )
      );

      if (!relevantStyle) {
        throw httpError(`Style object ${styleAnalysisId} not found`);
      }

      const { image, isPublic } = relevantStyle;

      if (isPublic) {
        res
          .status(200)
          .json({ error: "This photo has already been published." });
        return;
      }

      const { latestProgress, name, avatar } = userInfo;
      const { face } = latestProgress;

      const userImage = face.images.find(
        (imageObj) => imageObj.position === "front"
      ).mainUrl.url;

      const moderationResponse = await checkIfSelf({
        userId: String(userInfo._id),
        userImage,
        image,
        categoryName: CategoryNameEnum.STYLESCAN,
      });

      if (!moderationResponse) {
        res
          .status(200)
          .json({ error: "You can only publish images of yourself" });
        return;
      }

      const { privacy } = club;

      const stylePrivacy = privacy.find((pr) => pr.name === "style");

      if (!stylePrivacy.value) {
        res.status(200).json({
          error: `You need to enable the style data sharing in the club settings to be able to publish to Club.`,
        });
        return;
      }

      await doWithRetries(async () =>
        db.collection("StyleAnalysis").updateOne(
          { _id: new ObjectId(styleAnalysisId) },
          {
            $set: {
              avatar,
              isPublic: true,
              userName: name,
            },
          }
        )
      );

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
