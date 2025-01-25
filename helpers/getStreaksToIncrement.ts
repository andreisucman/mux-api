import { PartEnum, PrivacyType } from "types.js";
import setUtcMidnight from "helpers/setUtcMidnight.js";
import httpError from "./httpError.js";
import { daysFrom } from "./utils.js";

type StreakDatesType = {
  default: { [key: string]: Date };
  club: { [key: string]: Date };
};

type Props = {
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

  return new Date() > new Date(typeStreakDates[part]);
}

export default function getStreaksToIncrement({
  part,
  timeZone,
  privacy,
  streakDates,
}: Props) {
  try {
    let canIncrementDefault = getCanIncrement(streakDates.default, part);
    let canIncrementClub = getCanIncrement(streakDates.club, part);

    const midnightUTCofTomorrow = setUtcMidnight({
      date: daysFrom({ days: 1 }),
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
        ["default"]: {
          ...newStreakDates["default"],
          [part]: midnightUTCofTomorrow,
        },
      };
    }

    const progressPrivacy = privacy.find((pr) => pr.name === "progress");
    const headPrivacy = progressPrivacy.types.find((tp) => tp.name === "head");

    if (headPrivacy && canIncrementClub) {
      if (headPrivacy.value) {
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
          ["club"]: {
            ...newStreakDates["club"],
            [part]: midnightUTCofTomorrow,
          },
        };
      }
    }

    return { newStreakDates, streaksToIncrement };
  } catch (err) {
    throw httpError(err);
  }
}
