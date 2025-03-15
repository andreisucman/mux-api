import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import updateContent from "@/functions/updateContent.js";
import { ModerationStatusEnum } from "@/types.js";
import httpError from "@/helpers/httpError.js";
import { daysFrom } from "@/helpers/utils.js";
import { db } from "init.js";
import updateAnalytics from "./updateAnalytics.js";

type Props = {
  userId: string;
};

export default async function removeFromClub({ userId }: Props) {
  try {
    await updateContent({
      userId,
      collections: ["BeforeAfter", "Progress", "Proof", "Diary", "Routine"],
      updatePayload: { isPublic: false },
    });

    const canRejoinClubAfter = daysFrom({ days: 7 });

    await doWithRetries(async () =>
      db.collection("User").updateOne(
        {
          _id: new ObjectId(userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        { $set: { club: null, name: null, avatar: null, canRejoinClubAfter } }
      )
    );

    updateAnalytics({
      userId: String(userId),
      incrementPayload: { "overview.club.left": 1 },
    });
  } catch (err) {
    throw httpError(err);
  }
}
