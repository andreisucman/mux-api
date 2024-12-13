type SolutionsAndFrequenciesType = {
  key: string;
  name: string;
  color: string;
  icon: string;
  total: number;
  concern: string;
};

type TurnTasksIntoScheduleProps = {
  solutionsAndFrequencies: SolutionsAndFrequenciesType[];
  dateOne: Date;
  dateTwo: Date;
  earliestStartMap: { [key: string]: any };
};

export default function turnTasksIntoSchedule({
  solutionsAndFrequencies,
  earliestStartMap,
  dateOne,
  dateTwo,
}: TurnTasksIntoScheduleProps) {
  const allTasks: { date: string; key: string; concern: string }[] = [];

  solutionsAndFrequencies.forEach((solution) => {
    const intervals = generateIntervals({
      key: solution.key,
      total: solution.total,
      earliestStartMap,
      dateOne,
      dateTwo,
    });

    if (intervals) {
      for (const interval of intervals) {
        allTasks.push({
          date: interval,
          key: solution.key,
          concern: solution.concern,
        });
      }
    }
  });

  const schedule = allTasks.reduce((acc: { [key: string]: any }, current) => {
    const { date, ...otherCurrent } = current;
    if (acc[date]) {
      acc[date].push(otherCurrent);
    } else {
      acc[date] = [otherCurrent];
    }
    return acc;
  }, {});

  const sortedSchedule = sortTasksInScheduleByDate(schedule);

  return sortedSchedule;
}

function sortTasksInScheduleByDate(schedule: { [key: string]: any }) {
  try {
    const keys = Object.keys(schedule);
    const sortedSchedule = keys
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())
      .reduce((acc: { [key: string]: any }, key) => {
        if (schedule[key]) acc[key] = schedule[key];
        return acc;
      }, {});
    return sortedSchedule;
  } catch (err) {
    throw new Error(`sortTasksInScheduleByDate - ${err.message}`);
  }
}

type GenerateIntervalsProps = {
  key: string;
  dateOne: Date;
  dateTwo: Date;
  total: number;
  earliestStartMap: { [key: string]: string };
};

function generateIntervals({
  key,
  dateOne,
  dateTwo,
  total,
  earliestStartMap,
}: GenerateIntervalsProps) {
  try {
    if (!dateOne || !dateTwo || !total || !key) {
      throw new Error(`Missing input params`);
    }

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
