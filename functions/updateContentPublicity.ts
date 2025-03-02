import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import calculateDifferenceInPrivacies from "helpers/calculateDifferenceInPrivacies.js";
import { ModerationStatusEnum, PrivacyType } from "types.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "./getUserInfo.js";

type Props = {
  userId: string;
  newPrivacy: PrivacyType[];
};

export default async function updateContentPublicity({
  userId,
  newPrivacy,
}: Props) {
  try {
    const userInfo = await getUserInfo({
      userId,
      projection: { "club.privacy": 1, name: 1, avatar: 1 },
    });

    if (!userInfo) throw httpError("No userInfo");

    const { club, name, avatar } = userInfo;
    const { privacy: currentPrivacy } = club;

    const difference = calculateDifferenceInPrivacies(
      currentPrivacy,
      newPrivacy
    );

    const progressDifferences = difference.filter(
      (pr) => pr.category === "progress"
    );

    const toUpdateProgressAndBA = progressDifferences.map(
      (obj: { name: string; value: boolean }) => ({
        updateMany: {
          filter: {
            userId: new ObjectId(userId),
            part: obj.name,
          },
          update: {
            $set: {
              isPublic: obj.value,
              userName: name,
              avatar,
            },
          },
        },
      })
    );

    const proofDifferences = difference.filter((pr) => pr.category === "proof");

    const toUpdateProof = proofDifferences.map(
      (obj: { name: string; value: boolean }) => ({
        updateMany: {
          filter: {
            userId: new ObjectId(userId),
            part: obj.name,
          },
          update: {
            $set: {
              isPublic: obj.value,
              userName: name,
              avatar,
            },
          },
        },
      })
    );

    const diaryDifferences = difference.filter((pr) => pr.category === "diary");

    const toUpdateDiary = diaryDifferences.map(
      (obj: { name: string; value: boolean }) => ({
        updateMany: {
          filter: {
            userId: new ObjectId(userId),
          },
          update: {
            $set: {
              isPublic: obj.value,
              userName: name,
              avatar,
            },
          },
        },
      })
    );

    const answerDifference = difference.filter(
      (pr) => pr.category === "answer"
    );

    const toUpdateAnswers = answerDifference.map(
      (obj: { name: string; value: boolean }) => ({
        updateMany: {
          filter: {
            userId: new ObjectId(userId),
          },
          update: {
            $set: {
              isPublic: obj.value,
              userName: name,
              avatar,
            },
          },
        },
      })
    );

    if (toUpdateAnswers.length > 0)
      await doWithRetries(async () =>
        db.collection("Answer").bulkWrite(toUpdateAnswers)
      );

    if (toUpdateProof.length > 0)
      await doWithRetries(async () =>
        db.collection("Proof").bulkWrite(toUpdateProof)
      );

    if (toUpdateProgressAndBA.length > 0)
      await doWithRetries(async () =>
        db.collection("Progress").bulkWrite(toUpdateProgressAndBA)
      );

    if (toUpdateProgressAndBA.length > 0)
      await doWithRetries(async () =>
        db.collection("BeforeAfter").bulkWrite(toUpdateProgressAndBA)
      );

    if (toUpdateDiary.length > 0)
      await doWithRetries(async () =>
        db.collection("Diary").bulkWrite(toUpdateDiary)
      );

    const userUpdatePayload: { [key: string]: any } = {
      "club.privacy": newPrivacy,
    };

    const aboutDifference = difference.find((obj) => obj.category === "about");

    if (aboutDifference) userUpdatePayload.isPublic = aboutDifference.value;

    await doWithRetries(async () =>
      db.collection("User").updateOne(
        {
          _id: new ObjectId(userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        { $set: userUpdatePayload }
      )
    );
  } catch (err) {
    throw httpError(err);
  }
}
