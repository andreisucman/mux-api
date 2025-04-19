import { DateTime } from "luxon";

type SetToMidnight = {
  date: Date;
  timeZone?: string;
};

export default function setToMidnight({ date, timeZone }: SetToMidnight): Date {
  const midnightDate = DateTime.fromJSDate(date, { zone: timeZone }).startOf("day").toUTC();
  return midnightDate.toJSDate();
}
