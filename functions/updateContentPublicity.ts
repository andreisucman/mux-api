import { ObjectId } from "mongodb";
import { db } from "init.js";
import doWithRetries from "helpers/doWithRetries.js";
import calculateDifferenceInPrivacies from "helpers/calculateDifferenceInPrivacies.js";
import { PrivacyType } from "types.js";
import httpError from "@/helpers/httpError.js";
import getUserInfo from "./getUserInfo.js";

type Props = {
  userName: string;
  newPrivacy: PrivacyType[];
};

export default async function updateContentPublicity({
  userName,
  newPrivacy,
}: Props) {
  try {
    const userInfo = await getUserInfo({
      userName,
      projection: { "club.privacy": 1, name: 1, avatar: 1 },
    });

    if (!userInfo) throw httpError("No userInfo");

    const { club, name, avatar } = userInfo;
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
            name: userName,
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
      }));

    const toUpdateStyle = difference
      .filter((typePrivacyObj) => typePrivacyObj.name === "style")
      .map((obj: { name: string; type: string; value: boolean }) => ({
        updateOne: {
          filter: {
            name: userName,
          },
          update: {
            $set: {
              isPublic: obj.value,
              userName: name,
              avatar,
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
        .updateOne({ name: userName }, { $set: { "club.privacy": newPrivacy } })
    );
  } catch (err) {
    throw httpError(err);
  }
}
