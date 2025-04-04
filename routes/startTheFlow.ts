import * as dotenv from "dotenv";
dotenv.config();
import { Router, Request, Response, NextFunction } from "express";
import getUserData from "functions/getUserData.js";
import doWithRetries from "helpers/doWithRetries.js";
import createUser from "@/functions/createUser.js";
import { CustomRequest, DemographicsType, UserType } from "types.js";
import { defaultDemographics } from "@/data/defaultUser.js";

const route = Router();

type Props = {
  tosAccepted: boolean;
  demographics: DemographicsType;
};

route.post("/", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { tosAccepted, demographics }: Props = req.body;

  try {
    const createUserResponse = await doWithRetries(
      async () =>
        await createUser({
          timeZone: req.timeZone,
          tosAccepted,
          demographics: { ...defaultDemographics, ...demographics },
        })
    );

    const userData = (await doWithRetries(async () =>
      getUserData({ userId: String(createUserResponse._id) })
    )) as unknown as UserType;

    res.status(200).json({
      message: { ...createUserResponse, ...userData },
    });
  } catch (err) {
    next(err);
  }
});

export default route;
