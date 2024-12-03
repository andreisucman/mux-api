import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import checkProofImage from "functions/checkProofImage.js";
import { daysFrom } from "helpers/utils.js";
import isMajorityOfImagesIdentical from "functions/isMajorityOfImagesIdentical.js";
import extractImagesFromVideo from "functions/extractImagesFromVideo.js";
import { extensionTypeMap } from "data/extensionTypeMap.js";
import combineSentences from "@/functions/combineSentences.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import {
  CustomRequest,
  ProofType,
  TaskStatusEnum,
  PrivacyType,
} from "types.js";
import { db } from "init.js";
import {
  UploadProofUserType,
  UploadProofTaskType,
} from "types/uploadProofTypes.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import analyzeCalories from "functions/analyzeCalories.js";
import getStreaksToIncrement from "helpers/getStreaksToIncrement.js";
import getScoreDifference from "helpers/getScoreDifference.js";
import getReadyBlurredUrls from "functions/getReadyBlurredUrls.js";
import httpError from "@/helpers/httpError.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskId, url, submissionId, blurType } = req.body;

    const urlExtension = url.includes(".") ? url.split(".").pop() : "";
    const correctExtension = ["jpg", "webm"].includes(urlExtension);

    if (!taskId || !url || !submissionId || !correctExtension) {
      res.status(400).json({
        error: "Bad request",
      });
      return;
    }

    try {
      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          { userId: new ObjectId(req.userId), type: taskId },
          {
            $set: { isRunning: true, progress: 1 },
            $unset: { isError: "", message: "" },
          },
          { upsert: true }
        )
      );

      res.status(200).end();

      const userInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          { _id: new ObjectId(req.userId) },
          {
            projection: {
              streakDates: 1,
              club: 1,
              demographics: 1,
              latestScoresDifference: 1,
              dailyCalorieGoal: 1,
            },
          }
        )
      )) as unknown as UploadProofUserType;

      if (!userInfo) throw httpError(`User ${req.userId} not found`);

      const taskInfo = (await doWithRetries(async () =>
        db.collection("Task").findOne(
          { _id: new ObjectId(taskId), status: "active" },
          {
            projection: {
              name: 1,
              key: 1,
              color: 1,
              part: 1,
              type: 1,
              icon: 1,
              concern: 1,
              requisite: 1,
              routineId: 1,
              requiredSubmissions: 1,
              restDays: 1,
              isRecipe: 1,
            },
          }
        )
      )) as unknown as UploadProofTaskType;

      if (!taskInfo) throw httpError(`Task ${taskId} not found`);

      /* get the previous images of the same routine */
      const oldProofsArray = await doWithRetries(async () =>
        db
          .collection("Proof")
          .find(
            { taskKey: taskInfo.key },
            {
              projection: { proofImages: 1 },
            }
          )
          .sort({ createdAt: -1 })
          .limit(2)
          .toArray()
      );

      const oldProofImages = oldProofsArray
        .flatMap((proof) => proof.proofImages)
        .filter(Boolean);

      const urlType = extensionTypeMap[urlExtension];

      await incrementProgress({
        type: taskId,
        increment: Math.round(Math.random() * 20 + 1),
        userId: req.userId,
      });

      const iId = setInterval(async () => {
        await incrementProgress({
          type: taskId,
          increment: Math.round(Math.random() * 5 + 1),
          userId: req.userId,
        });
      }, 5000);

      let proofImages;

      try {
        if (urlType === "video") {
          const { status, message, error } = await extractImagesFromVideo(url);

          if (status) {
            proofImages = message;
          } else {
            return await addAnalysisStatusError({
              message: error,
              userId: req.userId,
              type: taskId,
            });
          }
        } else if (urlType === "image") {
          proofImages = [url];
        }
      } catch (err) {
      } finally {
        clearInterval(iId);
      }

      // for (const proofImage of proofImages) { // let it be sequential for token economy
      //   const response = await moderateImages({
      //     userId: String(req.userId),
      //     image: proofImage,
      //   });

      //   if (!response.status) {
      //     throw new Error(response.message);
      //   }
      // }

      await incrementProgress({
        type: taskId,
        increment: Math.round(Math.random() * 30 + 15),
        userId: req.userId,
      });

      const majorityIdentical = await isMajorityOfImagesIdentical(
        ...proofImages,
        ...oldProofImages
      );

      if (majorityIdentical) {
        await addAnalysisStatusError({
          message: "This video is not accepted.",
          userId: req.userId,
          type: taskId,
        });
        return;
      }

      const verdicts = [];
      const explanations = [];

      for (const image of proofImages) {
        const { verdict: proofAccepted, message: verdictExplanation } =
          await checkProofImage({
            userId: req.userId,
            requisite: taskInfo.requisite,
            image,
          });

        verdicts.push(proofAccepted);
        explanations.push(verdictExplanation);
      }

      const checkFailed =
        verdicts.filter(Boolean).length < Math.round(proofImages.length / 2);

      if (checkFailed) {
        const message = await combineSentences({
          userId: req.userId,
          sentences: explanations,
        });
        await addAnalysisStatusError({
          message,
          userId: req.userId,
          type: taskId,
        });
        return;
      }

      const { mainThumbnail, mainUrl, thumbnails, urls } =
        await getReadyBlurredUrls({
          url,
          blurType,
          thumbnail: proofImages[0],
        });

      const {
        name: taskName,
        key,
        type,
        part,
        color,
        icon,
        concern,
        requisite,
        routineId,
      } = taskInfo || {};
      const { demographics, club, latestScoresDifference } = userInfo || {};
      const { name, avatar, privacy } = club || {};

      /* add a new proof */
      const newProof: ProofType = {
        _id: new ObjectId(),
        userId: new ObjectId(req.userId),
        routineId: new ObjectId(routineId),
        createdAt: new Date(),
        taskKey: key,
        taskName,
        requisite,
        demographics,
        contentType: urlType as "video",
        mainUrl,
        urls,
        icon,
        type,
        part,
        color,
        taskId: new ObjectId(taskId),
        concern,
        mainThumbnail,
        thumbnails,
        proofImages,
        avatar,
        clubName: name,
        isPublic: false,
        latestBodyScoreDifference: 0,
        latestHeadScoreDifference: 0,
      };

      const relevantTypePrivacy = privacy?.find(
        (typePrivacyObj: PrivacyType) => typePrivacyObj.name === type
      );

      const relevantPartPrivacy = relevantTypePrivacy?.parts?.find(
        (partPrivacyObj: { name: string }) => partPrivacyObj.name === part
      );

      if (relevantPartPrivacy) {
        newProof.isPublic = relevantPartPrivacy.value;
      }

      const { streakDates, timeZone } = userInfo;
      const { newStreakDates, streaksToIncrement } = getStreaksToIncrement({
        partPrivacy: relevantPartPrivacy,
        part,
        streakDates,
        timeZone,
      });

      const { latestBodyScoreDifference, latestHeadScoreDifference } =
        getScoreDifference({ latestScoresDifference, privacy });

      newProof.latestHeadScoreDifference = latestHeadScoreDifference;
      newProof.latestBodyScoreDifference = latestBodyScoreDifference;

      await doWithRetries(async () =>
        db.collection("Proof").insertOne(newProof)
      );

      const relevantSubmission = taskInfo.requiredSubmissions.find(
        (s) => s.submissionId === submissionId
      );

      const restRequiredSubmissions = taskInfo.requiredSubmissions.filter(
        (s) => s.submissionId !== submissionId
      );

      const updatedRequiredSubmissions = [
        ...restRequiredSubmissions,
        { ...relevantSubmission, proofId: newProof._id, isSubmitted: true },
      ];

      const isTaskCompleted = updatedRequiredSubmissions.every(
        (submission) => submission.isSubmitted === true
      );

      const taskUpdate = {
        $set: {
          requiredSubmissions: updatedRequiredSubmissions,
        } as { [key: string]: any },
      };

      if (isTaskCompleted) {
        taskUpdate.$set.completedAt = new Date();
        taskUpdate.$set.status = "completed" as TaskStatusEnum;
        taskUpdate.$set.nextCanStartDate = daysFrom({
          days: taskInfo.restDays,
        });
      }

      const userUpdatePayload = {
        $inc: streaksToIncrement,
        $set: { streakDates: newStreakDates },
      };

      /* decrement the daily calories for food submissions */
      if (taskInfo.isRecipe) {
        const { dailyCalorieGoal } = userInfo;
        const foodAnalysis = await analyzeCalories({
          userId: req.userId,
          url: proofImages[0],
        });
        const { energy } = foodAnalysis;
        const newDailyCalorieGoal = Math.max(0, dailyCalorieGoal - energy);
        userUpdatePayload.$inc.dailyCalorieGoal = newDailyCalorieGoal;
      }

      await doWithRetries(async () =>
        db
          .collection("User")
          .updateOne({ _id: new ObjectId(req.userId) }, userUpdatePayload)
      );

      await doWithRetries(async () =>
        db
          .collection("Task")
          .updateOne({ _id: new ObjectId(taskId) }, taskUpdate)
      );

      await doWithRetries(async () =>
        db.collection("Routine").updateOne(
          { _id: new ObjectId(routineId), "allTasks.key": key },
          {
            $inc: {
              [`allTasks.$.completed`]: 1,
              [`allTasks.$.unknown`]: -1,
            },
          }
        )
      );

      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          { userId: new ObjectId(req.userId), type: taskId },
          {
            $set: { isRunning: false, progress: 0 },
            $unset: { isError: "", message: "" },
          }
        )
      );
    } catch (err) {
      await addAnalysisStatusError({
        userId: String(req.userId),
        type: taskId,
        message: err.message,
      });
    }
  }
);

export default route;
