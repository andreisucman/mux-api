import * as dotenv from "dotenv";
dotenv.config();
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import createUser from "@/functions/createUser.js";
import { CustomRequest, DemographicsType } from "types.js";
import { defaultDemographics } from "@/data/defaultUser.js";
import getUserInfo from "@/functions/getUserInfo.js";
import { defaultUserProjection } from "@/functions/checkIfUserExists.js";

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

    const userData = await getUserInfo({ userId: String(createUserResponse._id), projection: defaultUserProjection });

    res.status(200).json({
      message: { ...createUserResponse, ...userData },
    });
  } catch (err) {
    next(err);
  }
});

export default route;
