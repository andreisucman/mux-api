import { PartEnum, PrivacyType, TaskStatusEnum } from "types.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import httpError from "./httpError.js";
import { daysFrom, setToUtcMidnight } from "./utils.js";
import doWithRetries from "./doWithRetries.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

type StreakDatesType = {
  default: { [key: string]: Date };
  club: { [key: string]: Date };
};

type Props = {
  userId:string;
  part: PartEnum;
  privacy: PrivacyType[];
  streakDates: StreakDatesType;
  timeZone: string;
};

function getCanIncrement(
  typeStreakDates: { [key: string]: Date },
  part: string
) {
  if (!typeStreakDates[part]) return true;

  const todayMidnight = setToUtcMidnight(new Date());
  const streakDate = setToUtcMidnight(new Date(typeStreakDates[part]));

  return todayMidnight > streakDate;
}

export default async function getStreaksToIncrement({
  userId,
  part,
  timeZone,
  privacy,
  streakDates,
}: Props) {
  try {
    const todayMidnight = setToMidnight({ date: new Date(), timeZone });

    const remainingActiveTasksForPart = await doWithRetries(async () =>
      db.collection("Task").countDocuments({
        userId: new ObjectId(userId),
        startsAt: { $gte: todayMidnight },
        expiresAt: { $lte: daysFrom({ days: 1, date: todayMidnight }) },
        status: TaskStatusEnum.ACTIVE,
        part,
      })
    );

    if (remainingActiveTasksForPart > 1) return;
    
    let canIncrementDefault = getCanIncrement(streakDates.default, part);
    let canIncrementClub = getCanIncrement(streakDates.club, part);

    const streaksToIncrement: { [key: string]: number } = {};
    let newStreakDates = { ...streakDates };

    if (canIncrementDefault) {
      if (part === "face") {
        streaksToIncrement["streaks.faceStreak"] = 1;
      }

      if (part === "mouth") {
        streaksToIncrement["streaks.mouthStreak"] = 1;
      }

      if (part === "scalp") {
        streaksToIncrement["streaks.scalpStreak"] = 1;
      }

      if (part === "body") {
        streaksToIncrement["streaks.bodyStreak"] = 1;
      }

      newStreakDates = {
        ...newStreakDates,
        default: {
          ...newStreakDates.default,
          [part]: todayMidnight,
        },
      };
    }

    const progressPrivacy = privacy.find((pr) => pr.name === "progress");
    const relevantPrivacy = progressPrivacy.parts.find(
      (tp) => tp.name === part
    );

    if (relevantPrivacy && canIncrementClub) {
      if (relevantPrivacy.value) {
        if (part === "face") {
          streaksToIncrement["streaks.clubFaceStreak"] = 1;
        }

        if (part === "mouth") {
          streaksToIncrement["streaks.clubMouthStreak"] = 1;
        }

        if (part === "scalp") {
          streaksToIncrement["streaks.clubScalpStreak"] = 1;
        }

        if (part === "body") {
          streaksToIncrement["streaks.clubBodyStreak"] = 1;
        }

        newStreakDates = {
          ...newStreakDates,
          club: {
            ...newStreakDates.club,
            [part]: todayMidnight,
          },
        };
      }
    }

    return { newStreakDates, streaksToIncrement };
  } catch (err) {
    throw httpError(err);
  }
}
