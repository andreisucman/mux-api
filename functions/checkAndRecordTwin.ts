import { ObjectId } from "mongodb";
import checkForTwins from "./checkForTwins.js";
import createHumanEmbedding from "./createHumanEmbedding.js";
import doWithRetries from "@/helpers/doWithRetries.js";
import httpError from "@/helpers/httpError.js";
import checkIfSuspended from "./checkIfSuspended.js";
import { CategoryNameEnum } from "@/types.js";
import { db } from "@/init.js";

type Props = {
  requestUserId?: string;
  payloadUserId: string;
  image?: string;
  registryFilter?: { [key: string]: any };
  ip?: string;
  categoryName: CategoryNameEnum;
};

const skipCheckingTheseParts = ["mouth", "scalp"];
const skipCheckingThesePositions = ["back"];

export default async function checkAndRecordTwin({
  requestUserId,
  payloadUserId,
  categoryName,
  registryFilter = {},
  image,
}: Props) {
  let response = { mustLogin: false, isSuspended: false, errorMessage: "" };

  const { part, ...restFilter } = registryFilter;

  const skip =
    (part && skipCheckingTheseParts.includes(part)) ||
    skipCheckingThesePositions.includes(restFilter.position);

  if (skip) return response;

  try {
    let embedding;

    if (image) {
      const { errorMessage, message } = await createHumanEmbedding(image);

      if (errorMessage) {
        response.errorMessage = errorMessage as string;
        return response;
      }

      embedding = message;
    }

    response.isSuspended = await checkIfSuspended({
      embedding,
      image,
      userId: requestUserId || payloadUserId,
      categoryName,
    });

    const twinIds = await checkForTwins({
      userId: requestUserId || payloadUserId,
      image,
      embedding,
      registryFilter: restFilter,
      categoryName,
    });

    if (twinIds.length > 0) {
      if (requestUserId && embedding) {
        // add a twin record if logged in and twin exists
        doWithRetries(async () =>
          db
            .collection("User")
            .updateOne({ _id: new ObjectId(requestUserId) }, [
              {
                $set: {
                  twinIds: {
                    $ifNull: [
                      { $concatArrays: ["$twinIds", [requestUserId]] },
                      [requestUserId],
                    ],
                  },
                  twinCount: {
                    $size: {
                      $ifNull: [
                        { $concatArrays: ["$twinIds", [requestUserId]] },
                        [requestUserId],
                      ],
                    },
                  },
                },
              },
            ] as any)
        );
      } else {
        response.mustLogin = true; // prompt to login if not logged in and twin exists
      }
    }

    return response;
  } catch (err) {
    throw httpError(err);
  }
}
