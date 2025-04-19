import { EU_COUNTRIES } from "@/data/euCountries.js";
import * as dotenv from "dotenv";
import geoip from "geoip-lite";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import { CustomRequest } from "types.js";

const route = Router();

const isEU = (countryCode: string) => {
  return EU_COUNTRIES.includes(countryCode);
};

const getUserCountry = (ip: string) => {
  const geo = geoip.lookup(ip);
  return geo ? geo.country : null;
};

route.get("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const ipHeader = req.headers["cf-connecting-ip"] as string;
  const userIP = ipHeader || req.ip;

  console.log("ipHeader", ipHeader);
  console.log("req.ip", req.ip);
  try {
    const country = getUserCountry(userIP);
    console.log("country", country);
    let isEu = true;
    if (country) {
      isEu = isEU(country);
    }

    console.log("isEu", isEu);

    res.status(200).json({ message: isEu });
  } catch (err) {
    next(err);
  }
});

export default route;
