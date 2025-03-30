import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import {
  UserType,
  ClubPayoutDataType,
  ClubDataType,
  ModerationStatusEnum,
} from "types.js";
import { db } from "init.js";
import getUserInfo from "./getUserInfo.js";
import createRandomName from "./createRandomName.js";
import httpError from "@/helpers/httpError.js";
import { createAvatar } from "@dicebear/core";
import { micah } from "@dicebear/collection";
import generateAvatarParams from "@/helpers/avatar.js";

type Props = {
  userId: string;
};

export const defaultClubPayoutData: ClubPayoutDataType = {
  connectId: null,
  balance: {
    pending: { amount: 0, currency: "" },
    available: { amount: 0, currency: "" },
  },
  payoutsEnabled: false,
  detailsSubmitted: false,
  disabledReason: null,
};

export default async function createClubProfile({ userId }: Props) {
  try {
    const userInfo = await getUserInfo({
      userId,
      projection: { "demographics.ethnicity": 1 },
    });

    if (!userInfo) throw httpError(`User ${userId} not found`);

    const { demographics } = (userInfo as unknown as Partial<UserType>) || {};
    const { ethnicity } = demographics;

    const avatarParams = generateAvatarParams(ethnicity);
    const avatarConfig = createAvatar(micah, avatarParams as any);

    const imageAvatar = avatarConfig.toDataUri();

    const avatar = { config: avatarParams, image: imageAvatar };

    const randomName = await createRandomName();

    const defaultClubData: ClubDataType = {
      isActive: true,
      intro: "I love working out and eating healthy.",
      socials: [],
      payouts: defaultClubPayoutData,
    };

    await doWithRetries(async () =>
      db.collection("User").updateOne(
        {
          _id: new ObjectId(userId),
          moderationStatus: ModerationStatusEnum.ACTIVE,
        },
        {
          $set: {
            club: defaultClubData,
            name: randomName,
            avatar,
            isPublic: false,
          },
        }
      )
    );

    await doWithRetries(async () =>
      db
        .collection("Routine")
        .updateMany(
          { userId: new ObjectId(userId) },
          { $set: { userName: randomName } }
        )
    );

    await doWithRetries(async () =>
      db
        .collection("Task")
        .updateMany(
          { userId: new ObjectId(userId) },
          { $set: { userName: randomName } }
        )
    );

    return {
      clubData: defaultClubData,
      avatar,
      name: randomName,
    };
  } catch (err) {
    throw httpError(err);
  }
}
