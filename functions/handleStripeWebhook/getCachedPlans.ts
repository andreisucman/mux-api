import doWithRetries from "@/helpers/doWithRetries.js";
import { db } from "@/init.js";

async function getCachedPlans(lastPlanFetch: number, cachedPlans = []) {
  const now = Date.now();
  if (now - lastPlanFetch > 300000) {
    cachedPlans = await doWithRetries(async () =>
      db.collection("Plan").find().toArray()
    );
    lastPlanFetch = now;
  }

  return cachedPlans;
}

export default getCachedPlans;
