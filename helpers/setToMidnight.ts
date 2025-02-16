import { DateTime } from "luxon";

type SetToMidnight = {
  date: Date;
  timeZone?: string;
};

export default function setToMidnight({
  date,
  timeZone,
}: SetToMidnight) {
  let midnightDate = DateTime.fromJSDate(date, { zone: timeZone });

  midnightDate = midnightDate.set({
    hour: 0,
    minute: 0,
    second: 0,
    millisecond: 0,
  });

  const utcMidnightDate = midnightDate.toUTC();

  return utcMidnightDate.toJSDate();
}
