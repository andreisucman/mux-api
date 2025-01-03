import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import checkProofImage from "functions/checkProofImage.js";
import { daysFrom } from "helpers/utils.js";
import isMajorityOfImagesIdentical from "functions/isMajorityOfImagesIdentical.js";
import { extensionTypeMap } from "data/extensionTypeMap.js";
import addSuspiciousRecord from "@/functions/addSuspiciousRecord.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import {
  CustomRequest,
  ProofType,
  TaskStatusEnum,
  PrivacyType,
  CategoryNameEnum,
  TaskType,
} from "types.js";
import { db } from "init.js";
import {
  UploadProofUserType,
  UploadProofTaskType,
} from "types/uploadProofTypes.js";
import moderateContent from "@/functions/moderateContent.js";
import { ModerationStatusEnum } from "types.js";
import addAnalysisStatusError from "@/functions/addAnalysisStatusError.js";
import analyzeCalories from "functions/analyzeCalories.js";
import getStreaksToIncrement from "helpers/getStreaksToIncrement.js";
import getScoreDifference from "helpers/getScoreDifference.js";
import getReadyBlurredUrls from "functions/getReadyBlurredUrls.js";
import selectItemsAtEqualDistances from "helpers/utils.js";
import httpError from "@/helpers/httpError.js";
import extractImagesAndTextFromVideo from "@/functions/extractImagesAndTextFromVideo.js";
import getTheMostSuspiciousResult from "@/helpers/getTheMostSuspiciousResult.js";
import addModerationAnalyticsData from "@/functions/addModerationAnalyticsData.js";
import updateAnalytics from "@/functions/updateAnalytics.js";
import updateTasksAnalytics from "@/functions/updateTasksCreatedAnalytics.js";

const route = Router();

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskId, url, submissionId, blurType } = req.body;

    const urlExtension = url.includes(".") ? url.split(".").pop() : "";
    const correctExtension = ["jpg", "webm", "mp4"].includes(urlExtension);

    if (!taskId || !url || !submissionId || !correctExtension) {
      res.status(400).json({
        error: "Bad request",
      });
      return;
    }

    try {
      await doWithRetries(async () =>
        db.collection("AnalysisStatus").updateOne(
          { userId: new ObjectId(req.userId), operationKey: taskId },
          {
            $set: { isRunning: true, progress: 1 },
            $unset: { isError: null, message: "" },
          },
          { upsert: true }
        )
      );

      res.status(200).end();

      const userInfo = (await doWithRetries(async () =>
        db.collection("User").findOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          {
            projection: {
              club: 1,
              name: 1,
              avatar: 1,
              streakDates: 1,
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
              isCreated: 1,
            },
          }
        )
      )) as unknown as UploadProofTaskType;

      if (!taskInfo) throw httpError(`Task ${taskId} not found`);

      /* get the previous images of the same task */
      const oldProofsArray = await doWithRetries(async () =>
        db
          .collection("Proof")
          .find(
            {
              taskKey: taskInfo.key,
              moderationStatus: ModerationStatusEnum.ACTIVE,
            },
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

      await incrementProgress({
        operationKey: taskId,
        increment: Math.round(Math.random() * 20 + 1),
        userId: req.userId,
      });

      const iId = setInterval(async () => {
        await incrementProgress({
          operationKey: taskId,
          increment: Math.round(Math.random() * 5 + 1),
          userId: req.userId,
        });
      }, 5000);

      let transcription;
      let proofImages;
      const urlType = extensionTypeMap[urlExtension];

      try {
        if (urlType === "video") {
          const { status, message, error } =
            await extractImagesAndTextFromVideo({
              url,
              userId: req.userId,
            });

          if (status) {
            transcription = message.transcription;
            proofImages = message.urls;
          } else {
            await addAnalysisStatusError({
              message: error,
              userId: req.userId,
              operationKey: taskId,
            });
            return;
          }
        } else if (urlType === "image") {
          proofImages = [url];
        }
      } catch (err) {
      } finally {
        clearInterval(iId);
      }

      let moderationResults = [];
      let isSafe = false;
      let isSuspicious = false;

      if (proofImages) {
        for (const image of proofImages) {
          const imageModerationResponse = await moderateContent({
            content: [
              {
                type: "image_url",
                image_url: { url: image },
              },
            ],
          });

          isSafe = imageModerationResponse.isSafe;
          isSuspicious = imageModerationResponse.isSuspicious;
          moderationResults.push(...imageModerationResponse.moderationResults);

          if (!isSafe) {
            addModerationAnalyticsData({
              categoryName: CategoryNameEnum.PROOF,
              isSafe,
              moderationResults,
              isSuspicious,
              userId: req.userId,
            });

            await addAnalysisStatusError({
              message: "Video contains prohibited content.",
              userId: req.userId,
              operationKey: taskId,
            });
            return;
          }
        }
        if (transcription) {
          const audioModerationResponse = await moderateContent({
            content: [
              {
                type: "text",
                text: transcription,
              },
            ],
          });

          isSafe = audioModerationResponse.isSafe;
          isSuspicious = audioModerationResponse.isSuspicious;
          moderationResults.push(...audioModerationResponse.moderationResults);

          if (!isSafe) {
            addModerationAnalyticsData({
              categoryName: CategoryNameEnum.PROOF,
              isSafe,
              moderationResults,
              isSuspicious,
              userId: req.userId,
            });
            await addAnalysisStatusError({
              message: "Audio contains prohibited content.",
              userId: req.userId,
              operationKey: taskId,
            });
            return;
          }
        }
      }

      await incrementProgress({
        operationKey: taskId,
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
          operationKey: taskId,
        });
        return;
      }

      const verdicts = [];
      const explanations = [];
      const selectedProofImages = selectItemsAtEqualDistances(proofImages, 4);

      for (const image of selectedProofImages) {
        const { verdict: proofAccepted, message: verdictExplanation } =
          await checkProofImage({
            userId: req.userId,
            requisite: taskInfo.requisite,
            image,
            categoryName: CategoryNameEnum.PROOF,
          });

        verdicts.push(proofAccepted);
        explanations.push(verdictExplanation);
      }

      const checkFailed =
        verdicts.filter(Boolean).length <
        Math.round(selectedProofImages.length / 2);

      // if (checkFailed) {
      //   await addAnalysisStatusError({
      //     originalMessage: explanations.join("\n"),
      //     message:
      //       "This submission is not acceptable. Your proof must fulfill the requirement from the instructions.",
      //     userId: req.userId,
      //     operationKey: taskId,
      //   });
      //   return;
      // }

      let mainThumbnail = { name: blurType, url: proofImages[0] };
      let mainUrl = { name: blurType, url };
      let thumbnails = [mainThumbnail];
      let urls = [mainUrl];

      if (blurType !== "original") {
        const response = await getReadyBlurredUrls({
          url,
          blurType,
          thumbnail: proofImages[0],
        });

        mainThumbnail = response.mainThumbnail;
        mainUrl = response.mainUrl;
        thumbnails = response.thumbnails;
        urls = response.urls;
      }

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
      const { name, avatar, demographics, club, latestScoresDifference } =
        userInfo || {};
      const { privacy } = club || {};

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
        userName: name,
        isPublic: false,
        moderationStatus: ModerationStatusEnum.ACTIVE,
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

        updateTasksAnalytics({
          userId: req.userId,
          tasksToInsert: [taskInfo] as Partial<TaskType>[],
          keyOne: "tasksCompleted",
          keyTwo: "manualTasksCompleted",
        });
      }

      const userUpdatePayload = {
        $inc: streaksToIncrement,
        $set: { streakDates: newStreakDates } as { [key: string]: any },
      };

      /* decrement the daily calories for food submissions */
      if (taskInfo.isRecipe) {
        const { dailyCalorieGoal } = userInfo;
        const foodAnalysis = await analyzeCalories({
          userId: req.userId,
          url: selectedProofImages[0],
          categoryName: CategoryNameEnum.PROOF,
        });
        const { energy } = foodAnalysis;
        const newDailyCalorieGoal = Math.max(0, dailyCalorieGoal - energy);
        userUpdatePayload.$set.dailyCalorieGoal = newDailyCalorieGoal;
      }

      await doWithRetries(async () =>
        db.collection("User").updateOne(
          {
            _id: new ObjectId(req.userId),
            moderationStatus: ModerationStatusEnum.ACTIVE,
          },
          userUpdatePayload
        )
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
          { userId: new ObjectId(req.userId), operationKey: taskId },
          {
            $set: { isRunning: false, progress: 0 },
            $unset: { isError: "", message: "" },
          }
        )
      );

      if (moderationResults.length > 0) {
        addModerationAnalyticsData({
          categoryName: CategoryNameEnum.PROOF,
          isSafe,
          moderationResults,
          isSuspicious,
          userId: req.userId,
        });

        if (isSuspicious) {
          addSuspiciousRecord({
            collection: "Proof",
            moderationResults,
            contentId: String(newProof._id),
            userId: req.userId,
          });
        }
      }
    } catch (err) {
      await addAnalysisStatusError({
        userId: String(req.userId),
        operationKey: taskId,
        message: "An unexpected error occured. Please try again.",
        originalMessage: err.message,
      });
      next(err);
    }
  }
);

export default route;
