import { PartEnum, PrivacyType, TaskStatusEnum } from "types.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import httpError from "./httpError.js";
import { daysFrom } from "./utils.js";
import doWithRetries from "./doWithRetries.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

type StreakDatesType = {
  default: { [key: string]: Date };
  club: { [key: string]: Date };
};

type Props = {
  userId: string;
  part: PartEnum;
  privacy: PrivacyType[];
  streakDates: StreakDatesType;
  timeZone: string;
};

type GetCanIncrementProps = {
  typeStreakDates: { [key: string]: Date };
  part: string;
  timeZone: string;
};

function getCanIncrement({
  typeStreakDates,
  part,
  timeZone,
}: GetCanIncrementProps) {
  if (!typeStreakDates[part]) return true;

  const todayMidnight = setToMidnight({ date: new Date(), timeZone });
  const streakDate = setToMidnight({
    date: new Date(typeStreakDates[part]),
    timeZone,
  });

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
    const tomorrowMidnight = daysFrom({ days: 1, date: todayMidnight });

    const remainingActiveTasksForPart = await doWithRetries(async () =>
      db.collection("Task").countDocuments({
        userId: new ObjectId(userId),
        startsAt: { $gte: todayMidnight },
        expiresAt: { $lte: tomorrowMidnight },
        status: TaskStatusEnum.ACTIVE,
        part,
      })
    );

    if (remainingActiveTasksForPart > 1) return;

    console.log("part", part);
    console.log("todayMidnight", todayMidnight);
    console.log("tomorrowMidnight", tomorrowMidnight);
    console.log(
      "remainingActiveTasksForPart count",
      remainingActiveTasksForPart
    );

    let canIncrementDefault = getCanIncrement({
      typeStreakDates: streakDates.default,
      part,
      timeZone,
    });
    let canIncrementClub = getCanIncrement({
      typeStreakDates: streakDates.club,
      part,
      timeZone,
    });

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

    const progressPrivacy = privacy.find((pr) => pr.name === "proof");
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
