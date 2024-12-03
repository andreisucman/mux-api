import * as dotenv from "dotenv";
dotenv.config();

import { ObjectId } from "mongodb";
import { Router, Response, NextFunction } from "express";
import doWithRetries from "helpers/doWithRetries.js";
import { CustomRequest } from "types.js";
import { db } from "init.js";

const route = Router();

type Props = {
  styleId: string;
  voteType: "current" | "compare";
};

route.post(
  "/",
  async (req: CustomRequest, res: Response, next: NextFunction) => {
    const { styleId, voteType }: Props = req.body;

    if (!styleId || !["current", "compare"].includes(voteType)) {
      res.status(400).json({
        message: "Bad request",
      });
      return;
    }

    try {
      /* see what for the user voted last for this style */
      const lastVote = await doWithRetries({
        functionName: "voteForStyle - add analysis status",
        functionToExecute: async () =>
          db.collection("StyleAnalysis").findOne(
            {
              styleId: new ObjectId(styleId),
              userId: new ObjectId(req.userId),
            },
            { projection: { voteType: 1 } }
          ),
      });

      if (!lastVote) {
        await doWithRetries({
          functionName: "voteForStyle - update last vote",
          functionToExecute: async () =>
            db.collection("StyleVote").insertOne({
              styleId: new ObjectId(styleId),
              userId: new ObjectId(req.userId),
              voteType,
            }),
        });

        await doWithRetries({
          functionName: "voteForStyle - increment the vote",
          functionToExecute: async () =>
            db.collection("StyleAnalysis").updateOne(
              {
                _id: new ObjectId(styleId),
              },
              {
                $inc:
                  voteType === "current" ? { votes: 1 } : { compareVotes: 1 },
              }
            ),
        });
      } else {
        const { voteType: lastVoteType } = lastVote;

        if (voteType === lastVoteType) {
          res.status(200).json({ error: "Already voted for that photo" });
          return;
        } else {
          await doWithRetries({
            functionName: "voteForStyle - update last vote",
            functionToExecute: async () =>
              db.collection("StyleVote").updateOne(
                {
                  styleId: new ObjectId(styleId),
                  userId: new ObjectId(req.userId),
                },
                { $set: { voteType } },
                { upsert: true }
              ),
          });

          await doWithRetries({
            functionName: "voteForStyle - increment the vote",
            functionToExecute: async () =>
              db.collection("StyleAnalysis").updateOne(
                {
                  _id: new ObjectId(styleId),
                },
                {
                  $inc:
                    voteType === "current"
                      ? { votes: 1, compareVotes: -1 }
                      : { compareVotes: 1, votes: -1 },
                }
              ),
          });
        }
      }

      res.status(200).end();
    } catch (err) {
      next(err);
    }
  }
);

export default route;
