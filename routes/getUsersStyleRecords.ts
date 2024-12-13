import { ObjectId } from "mongodb";
import { Router, NextFunction } from "express";
import { db } from "init.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { CustomRequest } from "types.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get("/:userId?", async (req: CustomRequest, res, next: NextFunction) => {
  const { type, styleName, skip } = req.query;
  const { followingUserId } = req.params;

  const finalUserId = followingUserId || req.userId;

  if (!ObjectId.isValid(finalUserId)) {
    res.status(400).json({ error: "Bad request" });
    return;
  }

  try {
    if (followingUserId) {
      const { inClub, isFollowing, subscriptionActive } = await checkTrackedRBAC({
        userId: req.userId,
        followingUserId,
      });

      if (!inClub || !isFollowing || !subscriptionActive) {
        res.status(200).json({ message: [] });
        return;
      }
    }

    const filter: { [key: string]: any } = {
      userId: new ObjectId(finalUserId),
    };

    if (type) filter.type = type;
    if (styleName) filter.styleName = styleName;

    const projection: { [key: string]: any } = {
      _id: 1,
      userId: 1,
      styleIcon: 1,
      styleName: 1,
      isPublic: 1,
      mainUrl: 1,
      compareMainUrl: 1,
      compareStyleName: 1,
      urls: 1,
      compareUrls: 1,
      analysis: 1,
      initialAnalysis: 1,
      createdAt: 1,
      compareDate: 1,
      votes: 1,
      clubName: 1,
      avatar: 1,
      compareVotes: 1,
    };

    const styles = await doWithRetries(
      async () =>
        await db
          .collection("StyleAnalysis")
          .find(filter, {
            projection,
          })
          .sort({ createdAt: -1 })
          .skip(Number(skip) || 0)
          .limit(21)
          .toArray()
    );

    res.status(200).json({ message: styles });
  } catch (err) {
    next(err);
  }
});

export default route;
