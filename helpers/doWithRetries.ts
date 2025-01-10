import { delayExecution, getExponentialBackoffDelay } from "helpers/utils.js";
import { client } from "init.js";
import httpError from "./httpError.js";

async function doWithRetries<T>(
  fn: () => Promise<T>,
  attempt = 0,
  maxAttempts = 3
) {
  try {
    await client.connect();
    return fn();
  } catch (err) {
    if (attempt < maxAttempts) {
      const delayTime = getExponentialBackoffDelay(attempt);

      await delayExecution(delayTime);

      return await doWithRetries(fn, attempt + 1, maxAttempts);
    } else {
      throw httpError(err.message, err.status);
    }
  }
}

export default doWithRetries;
