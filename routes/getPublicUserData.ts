import * as dotenv from "dotenv";
dotenv.config();

import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { ModerationStatusEnum, UserType } from "types.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

route.get("/:userName?", async (req: CustomRequest, res: Response, next: NextFunction) => {
  const { userName } = req.params;

  if (!userName) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    const filter: { [key: string]: any } = {
      name: userName,
      moderationStatus: ModerationStatusEnum.ACTIVE,
    };

    const publicUserData = (await doWithRetries(async () =>
      db.collection("User").findOne(filter, {
        projection: {
          avatar: 1,
          "club.intro": 1,
          "club.socials": 1,
          _id: 0,
        },
      })
    )) as unknown as Partial<UserType>;

    const { club, avatar } = publicUserData || {};
    const { intro, socials } = club || {};

    const data = {
      name: userName,
      avatar,
      intro,
      socials,
    };

    res.status(200).json({ message: data });
  } catch (err) {
    next(err);
  }
});

export default route;
