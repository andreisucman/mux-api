export default function checkRewardCompletion(
  requirement: { [key: string]: any },
  payload: { [key: string]: any }
) {
  const result: any[] = [];

  function isPrimitive(value: any) {
    return (
      value !== null && (typeof value !== "object" || Array.isArray(value))
    );
  }

  function processObject(
    reqObj: { [key: string]: number },
    payloadObj: { [key: string]: number }
  ) {
    for (const [key, reqValue] of Object.entries(reqObj)) {
      if (payloadObj.hasOwnProperty(key)) {
        const payloadVal = payloadObj[key];

        if (isPrimitive(reqValue) && isPrimitive(payloadVal)) {
          result.push((payloadVal / reqValue) * 100);
        } else if (
          typeof reqValue === "object" &&
          typeof payloadVal === "object"
        ) {
          processObject(reqValue, payloadVal);
        } else {
          result.push(null);
        }
      }
    }
  }

  for (const [reqKey, reqValue] of Object.entries(requirement)) {
    if (payload.hasOwnProperty(reqKey)) {
      processObject(reqValue, payload[reqKey]);
    }
  }

  return Math.max(...result);
}
