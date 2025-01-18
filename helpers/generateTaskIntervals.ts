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
    if (isNaN(startDate as any)) {
      throw new Error(`Invalid dateOne value: ${dateOne}`);
    }
    const endDate = new Date(dateTwo);
    if (isNaN(endDate as any)) {
      throw new Error(`Invalid dateTwo value: ${dateTwo}`);
    }

    const earliestStart = new Date(earliestStartMap[key]);
    if (earliestStartMap[key] && isNaN(earliestStart as any)) {
      throw new Error(`Invalid date in earliestStartMap for key: ${key}`);
    }

    if (earliestStart > startDate) {
      startDate = earliestStart;
    }

    if (startDate > endDate) {
      return null;
    }

    const dates = [];

    const diffTime = endDate.getTime() - startDate.getTime();
    const interval = diffTime / Number(total);

    for (let i = 0; i < Number(total); i++) {
      const newDate = new Date(startDate.getTime() + interval * i);
      if (isNaN(newDate as any)) {
        throw new Error(`Generated invalid date at interval ${i}`);
      }
      dates.push(newDate);
    }

    return dates.map((date) => date.toDateString());
  } catch (error) {
    console.error("generateIntervals", error.message);
    throw error;
  }
}
