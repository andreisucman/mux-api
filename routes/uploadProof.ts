import * as dotenv from "dotenv";
dotenv.config();
import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import checkProofImage from "functions/checkProofImage.js";
import { daysFrom, urlToBase64 } from "helpers/utils.js";
import isMajorityOfImagesIdentical from "functions/isMajorityOfImagesIdentical.js";
import { extensionTypeMap } from "data/extensionTypeMap.js";
import addSuspiciousRecord from "@/functions/addSuspiciousRecord.js";
import incrementProgress from "@/helpers/incrementProgress.js";
import {
  CustomRequest,
  ProofType,
  TaskStatusEnum,
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
import getReadyBlurredUrls from "functions/getReadyBlurredUrls.js";
import selectItemsAtEqualDistances from "helpers/utils.js";
import httpError from "@/helpers/httpError.js";
import extractImagesAndTextFromVideo from "@/functions/extractImagesAndTextFromVideo.js";
import addModerationAnalyticsData from "@/functions/addModerationAnalyticsData.js";
import updateTasksAnalytics from "@/functions/updateTasksAnalytics.js";
import checkIfTaskIsAboutFood from "@/functions/checkIfTaskIsRelated.js";

const route = Router();

const validExtensions = ["jpg", "webm", "mp4"];

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { taskId, url, blurType } = req.body;

    const urlExtension = url.includes(".") ? url.split(".").pop() : "";

    if (
      !url ||
      !ObjectId.isValid(taskId) ||
      !validExtensions.includes(urlExtension)
    ) {
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
              nutrition: 1,
              streakDates: 1,
              demographics: 1,
              latestScoresDifference: 1,
            },
          }
        )
      )) as unknown as UploadProofUserType;

      if (!userInfo) throw httpError(`User ${req.userId} not found`);

      const taskInfo = (await doWithRetries(async () =>
        db.collection("Task").findOne(
          { _id: new ObjectId(taskId), status: TaskStatusEnum.ACTIVE },
          {
            projection: {
              name: 1,
              key: 1,
              color: 1,
              part: 1,
              icon: 1,
              concern: 1,
              instruction: 1,
              requisite: 1,
              routineId: 1,
              restDays: 1,
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
          .sort({ _id: -1 })
          .limit(2)
          .toArray()
      );

      const oldProofImages = oldProofsArray
        .flatMap((proof) => proof.proofImages)
        .filter(Boolean);

      await incrementProgress({
        operationKey: taskId,
        value: Math.round(Math.random() * 20 + 1),
        userId: req.userId,
      });

      const iId = setInterval(async () => {
        await incrementProgress({
          operationKey: taskId,
          value: Math.round(Math.random() * 5 + 1),
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
              cookies: req.cookies,
              url,
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
        throw httpError(err);
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
                image_url: { url: await urlToBase64(image) },
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
        value: Math.round(Math.random() * 30 + 15),
        userId: req.userId,
      });

      const validSubmission = await isMajorityOfImagesIdentical(
        ...proofImages,
        ...oldProofImages
      );

      if (!validSubmission) {
        await addAnalysisStatusError({
          message:
            "This appears to be a copy of the previous content. Please upload a new proof.",
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
        verdicts.filter((i) => i).length <
        Math.round(selectedProofImages.length / 2);

      if (checkFailed) {
        await addAnalysisStatusError({
          originalMessage: explanations.join("\n"),
          message:
            "This submission doesn't satisfy the requirements from the instructions.",
          userId: req.userId,
          operationKey: taskId,
        });
        return;
      }

      let mainThumbnail = { name: blurType, url: proofImages[0] };
      let mainUrl = { name: blurType, url };
      let thumbnails = [mainThumbnail];
      let urls = [mainUrl];

      if (blurType !== "original") {
        const response = await getReadyBlurredUrls({
          url,
          blurType,
          thumbnail: proofImages[0],
          cookies: req.cookies,
        });

        mainThumbnail = response.mainThumbnail;
        mainUrl = response.mainUrl;
        thumbnails = response.thumbnails;
        urls = response.urls;
      }

      const {
        name: taskName,
        key,
        part,
        color,
        icon,
        concern,
        requisite,
        routineId,
      } = taskInfo || {};
      const { name, avatar, demographics, club } = userInfo || {};
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
      };

      const userUpdatePayload: { [key: string]: any } = {};

      const { streakDates, timeZone } = userInfo;
      const { newStreakDates, streaksToIncrement } =
        await getStreaksToIncrement({
          privacy,
          part,
          timeZone,
          streakDates,
        });

      if (streaksToIncrement) userUpdatePayload.$inc = streaksToIncrement;
      if (newStreakDates)
        userUpdatePayload.$set = { streakDates: newStreakDates };

      if (privacy) {
        const proofPrivacy = privacy.find((pr) => pr.name === "proof");

        if (proofPrivacy) {
          const relevantPartPrivacy = proofPrivacy.parts.find(
            (p) => p.name === part
          );
          newProof.isPublic = relevantPartPrivacy.value;
        }
      }

      const taskUpdate = {
        $set: {
          proofId: newProof._id,
          completedAt: new Date(),
          status: TaskStatusEnum.COMPLETED,
          nextCanStartDate: daysFrom({
            days: taskInfo.restDays,
          }),
        },
      };

      updateTasksAnalytics({
        userId: req.userId,
        tasksToInsert: [taskInfo] as Partial<TaskType>[],
        keyOne: "tasksCompleted",
        keyTwo: "manualTasksCompleted",
      });

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

      const isTaskAboutFood = await checkIfTaskIsAboutFood({
        categoryName: CategoryNameEnum.PROOF,
        instruction: taskInfo.instruction,
        userId: req.userId,
      });

      /* decrement the daily calories for food submissions */
      if (isTaskAboutFood) {
        const { nutrition } = userInfo;
        const { remainingDailyCalories } = nutrition;

        const foodAnalysis = await analyzeCalories({
          userId: req.userId,
          url: selectedProofImages[0],
          categoryName: CategoryNameEnum.PROOF,
          onlyCalories: true,
          taskDescription: taskInfo.description,
        });

        const { energy } = foodAnalysis;
        const newRemainingCalories = Math.max(
          0,
          remainingDailyCalories - energy
        );

        userUpdatePayload.$set = {
          ...userUpdatePayload.$set,
          nutrition: {
            ...nutrition,
            remainingDailyCalories: newRemainingCalories,
          },
        };
      }

      if (Object.keys(userUpdatePayload).length > 0)
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

      await doWithRetries(async () =>
        db.collection("Proof").insertOne(newProof)
      );
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
