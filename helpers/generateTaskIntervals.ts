type GenerateTaskIntervalsProps = {
  key: string;
  dateOne: Date;
  dateTwo: Date;
  total: number;
  earliestStartMap: { [key: string]: string };
};
export default function generateTaskIntervals({
  key,
  dateOne,
  dateTwo,
  total,
  earliestStartMap,
}: GenerateTaskIntervalsProps) {
  try {
    let startDate = new Date(dateOne);
    if (isNaN(startDate.getTime())) {
      throw new Error(`Invalid dateOne value: ${dateOne}`);
    }
    const endDate = new Date(dateTwo);
    if (isNaN(endDate.getTime())) {
      throw new Error(`Invalid dateTwo value: ${dateTwo}`);
    }

    const earliestStart = new Date(earliestStartMap[key]);
    if (earliestStartMap[key] && isNaN(earliestStart.getTime())) {
      throw new Error(`Invalid date in earliestStartMap for key: ${key}`);
    }

    if (earliestStart > startDate) {
      startDate = earliestStart;
    }

    if (startDate > endDate) {
      return null;
    }

    if (typeof total !== "number" || total <= 0 || !Number.isInteger(total)) {
      throw new Error("total must be a positive integer");
    }

    if (total === 1) {
      return [startDate.toUTCString()];
    }

    const dates: Date[] = [];
    const diffTime = endDate.getTime() - startDate.getTime();
    const interval = Math.round(diffTime / (total - 1));

    for (let i = 0; i < total; i++) {
      const newDate = new Date(startDate.getTime() + interval * i);
      if (isNaN(newDate.getTime())) {
        throw new Error(`Generated invalid date at interval ${i}`);
      }
      dates.push(newDate);
    }

    return dates.map((date) => date.toUTCString());
  } catch (error) {
    console.error("generateTaskIntervals", error.message);
    throw error;
  }
}
