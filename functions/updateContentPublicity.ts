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

    const toUpdateProgresProofBa = difference.map(
      (obj: { name: string; type: string; value: boolean }) => ({
        updateOne: {
          filter: {
            userId: new ObjectId(userId),
            part: obj.name,
            type: obj.type,
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

    const toUpdateDiary = difference.map(
      (obj: { name: string; type: string; value: boolean }) => ({
        updateOne: {
          filter: {
            userId: new ObjectId(userId),
            type: obj.type,
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

    const toUpdateStyle = difference.map(
      (obj: { name: string; type: string; value: boolean }) => ({
        updateOne: {
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

    if (toUpdateProgresProofBa.length > 0)
      await doWithRetries(async () =>
        db.collection("Proof").bulkWrite(toUpdateProgresProofBa)
      );

    if (toUpdateProgresProofBa.length > 0)
      await doWithRetries(async () =>
        db.collection("Progress").bulkWrite(toUpdateProgresProofBa)
      );

    if (toUpdateProgresProofBa.length > 0)
      await doWithRetries(async () =>
        db.collection("BeforeAfter").bulkWrite(toUpdateProgresProofBa)
      );

    if (toUpdateStyle.length > 0)
      await doWithRetries(async () =>
        db.collection("StyleAnalysis").bulkWrite(toUpdateStyle)
      );

    if (toUpdateDiary.length > 0)
      await doWithRetries(async () =>
        db.collection("Diary").bulkWrite(toUpdateDiary)
      );

    await doWithRetries(async () =>
      db.collection("User").updateOne(
        {
          _id: new ObjectId(userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        { $set: { "club.privacy": newPrivacy } }
      )
    );
  } catch (err) {
    throw httpError(err);
  }
}
