import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import calculateDifferenceInPrivacies from "helpers/calculateDifferenceInPrivacies.js";
import { PrivacyType } from "types.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  newPrivacy: PrivacyType[];
};

export default async function updateContentPublicity({
  userId,
  newPrivacy,
}: Props) {
  try {
    const userInfo = await doWithRetries(async () =>
      db
        .collection("User")
        .findOne({ _id: new ObjectId(userId) }, { projection: { club: 1 } })
    );

    if (!userInfo) throw httpError("No userInfo");

    const { club } = userInfo;
    const { privacy: currentPrivacy } = club;

    const difference = calculateDifferenceInPrivacies(
      currentPrivacy,
      newPrivacy
    );

    const toUpdateProgresProofBa = difference
      .filter((typePrivacyObj) => typePrivacyObj.name !== "style")
      .map((obj: { name: string; type: string; value: boolean }) => ({
        updateOne: {
          filter: {
            userId: new ObjectId(userId),
            part: obj.name,
            type: obj.type,
          },
          update: {
            $set: {
              isPublic: obj.value,
              clubName: club.name,
              avatar: club.avatar,
            },
          },
        },
      }));

    const toUpdateStyle = difference
      .filter((typePrivacyObj) => typePrivacyObj.name === "style")
      .map((obj: { name: string; type: string; value: boolean }) => ({
        updateOne: {
          filter: {
            userId: new ObjectId(userId),
          },
          update: {
            $set: {
              isPublic: obj.value,
              clubName: club.name,
              avatar: club.avatar,
            },
          },
        },
      }));

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

    await doWithRetries(async () =>
      db
        .collection("User")
        .updateOne(
          { _id: new ObjectId(userId) },
          { $set: { "club.privacy": newPrivacy } }
        )
    );
  } catch (err) {
    throw httpError(err);
  }
}
