import { createHash } from "crypto";

export default function generateIpAndNumberFingerprint(
  ip: string,
  num: number
) {
  if (typeof ip !== "string" || !ip) {
    throw new Error("IP address must be a valid string.");
  }

  let ipString = "";

  const isIPv4 = ip.includes(".");
  const isIPv6 = ip.includes(":");

  if (isIPv4 && !isIPv6) {
    ipString = ip;
  } else if (isIPv6) {
    ipString = ip.replace(/:/g, "");
  } else {
    throw new Error("Invalid IP address format.");
  }

  const combinedString = ipString + num.toString();
  const hash = createHash("sha256").update(combinedString).digest("hex");

  return hash.slice(0, 32);
}
