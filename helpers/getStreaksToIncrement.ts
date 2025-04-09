import { PartEnum, TaskStatusEnum } from "types.js";
import setToMidnight from "@/helpers/setToMidnight.js";
import httpError from "./httpError.js";
import { daysFrom } from "./utils.js";
import doWithRetries from "./doWithRetries.js";
import { db } from "@/init.js";
import { ObjectId } from "mongodb";

type Props = {
  userId: string;
  part: PartEnum;
  timeZone: string;
  streakDates: { [key: string]: Date };
};

type GetCanIncrementProps = {
  part: string;
  timeZone: string;
  streakDates: { [key: string]: Date };
};

function getCanIncrement({
  part,
  timeZone,
  streakDates,
}: GetCanIncrementProps) {
  if (!streakDates) return true;

  const todayMidnight = setToMidnight({ date: new Date(), timeZone });
  const streakDate = setToMidnight({
    date: new Date(streakDates[part]),
    timeZone,
  });

  return todayMidnight > streakDate;
}

export default async function getStreaksToIncrement({
  userId,
  part,
  timeZone,
  streakDates,
}: Props) {
  try {
    const streaksToIncrement: { [key: string]: number } = {};
    let newStreakDates = { ...streakDates };

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

    let canIncrement = getCanIncrement({
      streakDates,
      part,
      timeZone,
    });

    if (canIncrement) {
      if (part === "face") {
        streaksToIncrement["streaks.faceStreak"] = 1;
      }

      if (part === "mouth") {
        streaksToIncrement["streaks.mouthStreak"] = 1;
      }

      if (part === "hair") {
        streaksToIncrement["streaks.hairStreak"] = 1;
      }

      if (part === "body") {
        streaksToIncrement["streaks.bodyStreak"] = 1;
      }

      newStreakDates = {
        ...newStreakDates,
        [part]: todayMidnight,
      };
    }

    return { newStreakDates, streaksToIncrement };
  } catch (err) {
    throw httpError(err);
  }
}
