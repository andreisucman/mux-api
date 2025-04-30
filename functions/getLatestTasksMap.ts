import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";

const getLatestTasksMap = async (filter: { [key: string]: any }) => {
  const latestCompletedTasks = await doWithRetries(async () =>
    db
      .collection("Task")
      .find(filter, { projection: { name: 1 } })
      .sort({ createdAt: -1 })
      .toArray()
  );

  let lastTasksMap;

  if (latestCompletedTasks.length > 0) {
    lastTasksMap = latestCompletedTasks.reduce((a, c) => {
      if (a[c.name]) {
        a[c.name] += 1;
      } else {
        a[c.name] = 1;
      }
      return a;
    }, {});
  }

  return lastTasksMap;
};

export default getLatestTasksMap;
