import { ObjectId } from "mongodb";
import { Router } from "express";
import { db } from "init.js";
import checkTrackedRBAC from "functions/checkTrackedRBAC.js";
import { CustomRequest } from "types.js";
import addErrorLog from "functions/addErrorLog.js";
import doWithRetries from "helpers/doWithRetries.js";

const route = Router();

route.get("/:userId?", async (req: CustomRequest, res) => {
  const { type, styleName, skip } = req.query;
  const { trackedUserId } = req.params;

  try {
    if (trackedUserId)
      await checkTrackedRBAC({
        userId: req.userId,
        trackedUserId,
      });

    const userId = new ObjectId(trackedUserId || req.userId);

    const filter: { [key: string]: any } = {
      userId,
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
      initialMainUrl: 1,
      urls: 1,
      analysis: 1,
      initialAnalysis: 1,
      createdAt: 1,
      likes: 1,
      initialLikes: 1,
    };

    const styles = await doWithRetries({
      functionName: "getUsersStyleRecords",
      functionToExecute: async () =>
        await db
          .collection("StyleAnalysis")
          .find(filter, {
            projection,
          })
          .sort({ createdAt: -1 })
          .skip(Number(skip) || 0)
          .limit(21)
          .toArray(),
    });

    res.status(200).json({ message: styles });
  } catch (error) {
    addErrorLog({
      functionName: "getUsersStyleRecords",
      message: error.message,
    });
    res.status(500).json({ error: "Unexpected error" });
  }
});

export default route;
