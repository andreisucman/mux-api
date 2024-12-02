import { ObjectId } from "mongodb";
import addErrorLog from "functions/addErrorLog.js";
import doWithRetries from "helpers/doWithRetries.js";
import getFeaturesToAnalyze from "helpers/getFeaturesToAnalyze.js";
import analyzeFeature from "functions/analyzeFeature.js";
import analyzeConcerns from "functions/analyzeConcerns.js";
import analyzePotential from "functions/analyzePotential.js";
import calculateHigherThanPart from "functions/calculateHigherThanPart.js";
import formatRatings from "@/helpers/formatRatings.js";
import {
  DemographicsType,
  ToAnalyzeType,
  TypeEnum,
  UserConcernType,
  ProgressType,
  ClubDataType,
  PartEnum,
  BlurTypeEnum,
  PrivacyType,
  ProgressImageType,
  BeforeAfterType,
} from "types.js";
import updateProgressImages from "functions/updateProgressImages.js";
import { PartResultType } from "@/types/analyzePartTypes.js";
import { db } from "init.js";

type Props = {
  userId: string;
  blurType: BlurTypeEnum;
  type: TypeEnum;
  part: PartEnum;
  club: ClubDataType;
  specialConsiderations: string;
  concerns: UserConcernType[];
  demographics: DemographicsType;
  toAnalyzeObjects: ToAnalyzeType[];
};

export default async function analyzePart({
  userId,
  club,
  type,
  part,
  blurType,
  concerns,
  demographics,
  specialConsiderations,
  toAnalyzeObjects,
}: Props): Promise<PartResultType> {
  try {
    const partConcerns = concerns.filter((obj) => obj.part === part);
    const partToAnalyzeObjects = toAnalyzeObjects.filter(
      (obj) => obj.part === part
    );

    const partResult = { part } as PartResultType;

    console.time("analyzePart - analyzePart");
    const featuresToAnalyze = getFeaturesToAnalyze({
      sex: demographics.sex,
      part,
      type,
    });

    const appearanceAnalysisResults = await doWithRetries({
      functionName: "analyzePart - head",
      functionToExecute: async () =>
        Promise.all(
          featuresToAnalyze.map((feature: string) =>
            doWithRetries({
              functionName: "analyzeFeature",
              functionToExecute: async () =>
                analyzeFeature({
                  type,
                  part,
                  userId,
                  feature,
                  sex: demographics.sex,
                  toAnalyzeObjects: partToAnalyzeObjects,
                }),
            })
          )
        ),
    });

    console.timeEnd("analyzePart - analyzePart");
    console.time("analyzePart - analyzeConcerns");

    await doWithRetries({
      functionName: "analyzePart - increment analysis status",
      functionToExecute: async () =>
        db
          .collection("AnalysisStatus")
          .updateOne(
            { userId: new ObjectId(userId), type },
            { $inc: { progress: 2 } }
          ),
    });

    const newConcerns = await analyzeConcerns({
      type,
      part,
      userId,
      sex: demographics.sex,
      toAnalyzeObjects: partToAnalyzeObjects,
    });

    console.timeEnd("analyzePart - analyzeConcerns");

    if (newConcerns && newConcerns.length > 0) {
      const uniqueConcerns = [...partConcerns, ...newConcerns].filter(
        (obj, i, arr) => arr.findIndex((o) => o.name === obj.name) === i
      );

      partResult.concerns = uniqueConcerns;
    }

    const createdAt = new Date();
    let scoresAndExplanations: { [key: string]: any } = {};

    const scoresAndExplanationsDontExist =
      !scoresAndExplanations ||
      Object.keys(scoresAndExplanations || {}).length === 0;

    if (scoresAndExplanationsDontExist) {
      console.time("analyzePart - analyzePotential");
      /* create the potential of the person */
      scoresAndExplanations = await analyzePotential({
        userId,
        type: type as TypeEnum,
        sex: demographics.sex,
        toAnalyzeObjects: partToAnalyzeObjects,
        ageInterval: demographics.ageInterval,
        listOfFeatures: featuresToAnalyze,
        analysisResults: appearanceAnalysisResults,
      });

      console.timeEnd("analyzePart - analyzePotential");

      await doWithRetries({
        functionName: "analyzePart - increment post potential status",
        functionToExecute: async () =>
          db
            .collection("AnalysisStatus")
            .updateOne(
              { userId: new ObjectId(userId), type },
              { $inc: { progress: 6 } }
            ),
      });

      partResult.potential = scoresAndExplanations;
    }

    /* add the record of progress to the Progress collection*/
    const scores = formatRatings(appearanceAnalysisResults);

    /* calculate the higher than percentages */
    const { partCurrentlyHigherThan, partPotentiallyHigherThan } =
      await calculateHigherThanPart({
        userId,
        part,
        type,
        sex: demographics.sex,
        ageInterval: demographics.ageInterval,
        currentScore: scores.overall,
        potentialScore: scoresAndExplanations.overall,
      });

    partResult.currentlyHigherThan = partCurrentlyHigherThan;
    partResult.potentiallyHigherThan = partPotentiallyHigherThan;

    /* calculate the progress so far */
    let initialProgress = (await doWithRetries({
      functionName: "analyzePart - get the first progress record",
      functionToExecute: async () =>
        db
          .collection("Progress")
          .find({
            userId: new ObjectId(userId),
            type,
            part,
          })
          .project({ scores: 1, images: 1, createdAt: 1 })
          .sort({ createdAt: 1 })
          .next(),
    })) as unknown as {
      _id: ObjectId;
      scores: { [key: string]: number };
      images: ProgressImageType[];
      createdAt: Date;
    };

    let initialScores: { [key: string]: number } = scores;

    if (initialProgress) initialScores = initialProgress.scores;

    const newScoresDifference = Object.keys(initialScores).reduce(
      (a: { [key: string]: number }, key) => {
        a[key] = Number(scores[key]) - Number(initialScores[key]);
        return a;
      },
      {}
    );

    const images = partToAnalyzeObjects.map((record: ToAnalyzeType) => ({
      position: record.position,
      mainUrl: record.mainUrl,
      urls: record.contentUrlTypes,
    }));

    const updatedImages = await updateProgressImages({
      currentImages: images,
      blurType,
    });

    const recordOfProgress: ProgressType = {
      _id: new ObjectId(),
      userId: new ObjectId(userId),
      type,
      part,
      scores,
      demographics,
      images: updatedImages,
      initialImages: initialProgress?.images || updatedImages,
      initialDate: initialProgress?.createdAt || createdAt,
      createdAt,
      concerns: newConcerns,
      scoresDifference: newScoresDifference,
      specialConsiderations,
      isPublic: false,
    };

    const beforeAfterUpdate: BeforeAfterType = {
      images,
      updatedAt: new Date(),
      demographics,
      initialDate: initialProgress?.createdAt || createdAt,
      initialImages: initialProgress?.images || updatedImages,
      scores,
      concerns: newConcerns,
      scoresDifference: newScoresDifference,
      isPublic: false,
    };

    if (club) {
      const relevantTypePrivacy = club.privacy.find(
        (rec: PrivacyType) => rec.name === type
      );
      if (relevantTypePrivacy) {
        const relevantPartPrivacy = relevantTypePrivacy.parts.find(
          (par: { name: string }) => par.name === part
        );

        if (relevantPartPrivacy) {
          recordOfProgress.isPublic = relevantPartPrivacy.value;
          beforeAfterUpdate.isPublic = relevantPartPrivacy.value;
        }
      }

      recordOfProgress.avatar = club.avatar;
      recordOfProgress.clubName = club.name;
      beforeAfterUpdate.avatar = club.avatar;
      beforeAfterUpdate.clubName = club.name;
    }

    await doWithRetries({
      functionName: "analyzePart - insert progress",
      functionToExecute: async () =>
        db.collection("Progress").insertOne(recordOfProgress),
    });

    await doWithRetries({
      functionName: "analyzePart - update before after",
      functionToExecute: async () =>
        db
          .collection("BeforeAfter")
          .updateOne(
            { userId: new ObjectId(userId), type, part },
            { $set: beforeAfterUpdate },
            { upsert: true }
          ),
    });

    partResult.latestScores = scores;
    partResult.scoresDifference = newScoresDifference;
    partResult.latestProgress = recordOfProgress;

    return partResult;
  } catch (err) {
    addErrorLog({ functionName: "analyzePart", message: err.message });
    throw err;
  }
}
