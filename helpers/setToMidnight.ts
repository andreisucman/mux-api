import { DateTime } from "luxon";

type SetToMidnight = {
  date: Date;
  timeZone?: string;
  dontSetToMidnight?: boolean;
};

export default function setToMidnight({ date, timeZone, dontSetToMidnight = false }: SetToMidnight) {
  let midnightDate = DateTime.fromJSDate(new Date(date), { zone: timeZone });

  if (!dontSetToMidnight) {
    midnightDate = midnightDate.set({
      hour: 0,
      minute: 0,
      second: 0,
      millisecond: 0,
    });
  }

  const utcMidnightDate = midnightDate.toUTC();

  return utcMidnightDate.toJSDate();
}
