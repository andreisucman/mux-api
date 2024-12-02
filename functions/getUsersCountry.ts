import { Request } from "express";
import geoip from "geoip-lite";
import addErrorLog from "functions/addErrorLog.js";

export default async function getUsersCountry(req: Request) {
  try {
    const forwardedHeader = req.headers["x-forwarded-for"];

    let ip =
      req.connection.remoteAddress || req.socket.remoteAddress || "127.0.0.1";

    if (typeof forwardedHeader === "string") {
      ip = forwardedHeader?.split(",")[0];
    }

    const geo = geoip.lookup(ip);

    const { country, city } = geo || {};

    return { country, city };
  } catch (err) {
    addErrorLog({ functionName: "getUsersCountry", message: err.message });
    throw err;
  }
}
