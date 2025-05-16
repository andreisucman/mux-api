import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import updateContent from "@/functions/updateContent.js";
import { ModerationStatusEnum } from "@/types.js";
import httpError from "@/helpers/httpError.js";
import { daysFrom } from "@/helpers/utils.js";
import { db } from "init.js";
import updateAnalytics from "./updateAnalytics.js";

export default async function removeFromClub(userId: string) {
  try {
    const canRejoinClubAfter = daysFrom({ days: 7 });

    await doWithRetries(async () =>
      db.collection("User").updateOne(
        {
          _id: new ObjectId(userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        {
          $set: {
            "club.isActive": false,
            "club.socials": [],
            canRejoinClubAfter,
            isPublic: false,
          },
        }
      )
    );

    await doWithRetries(async () =>
      db.collection("RoutineData").updateMany(
        {
          userId: new ObjectId(userId),
        },
        {
          $set: { status: "hidden" },
        }
      )
    );

    updateAnalytics({
      userId: String(userId),
      incrementPayload: { "overview.user.club.left": 1 },
    });

    updateContent({
      filter: { userId: new ObjectId(userId) },
      collections: ["BeforeAfter", "Progress", "Proof", "Diary", "Routine"],
      updatePayload: { isPublic: false, userName: null, avatar: null },
    });
  } catch (err) {
    throw httpError(err);
  }
}
