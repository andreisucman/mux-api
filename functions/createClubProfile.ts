import { ObjectId } from "mongodb";
import doWithRetries from "helpers/doWithRetries.js";
import {
  UserType,
  ClubPayoutDataType,
  ClubDataType,
  ModerationStatusEnum,
} from "types.js";
import { db } from "init.js";
import { Sex } from "react-nice-avatar";
import getUserInfo from "./getUserInfo.js";
import createRandomName from "./createRandomName.js";
import httpError from "@/helpers/httpError.js";
import * as reactNiceAvatar from "react-nice-avatar";

type Props = {
  userId: string;
};

const avatarSkinColorMap = {
  white: "#f5e6da",
  asian: "#d1a67c",
  black: "#5b3a29",
  hispanic: "#a47448",
  arab: "#c89f7c",
  south_asian: "#8c6239",
  native_american: "#b57c53",
};

const avatarSexMap: { [key: string]: string } = {
  male: "man",
  female: "woman",
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
      projection: { demographics: 1 },
    });

    if (!userInfo) throw httpError(`User ${userId} not found`);

    const { demographics } = (userInfo as unknown as Partial<UserType>) || {};
    const { sex, ethnicity } = demographics;

    const avatarConfig = reactNiceAvatar.default.genConfig({
      sex: avatarSexMap[sex || "male"] as Sex,
      faceColor: avatarSkinColorMap[ethnicity],
      mouthStyle: "peace",
      glassesStyle: "none",
      hairColorRandom: true,
      isGradient: true,
    });

    const randomName = await createRandomName();

    const defaultClubData: ClubDataType = {
      isActive: true,
      followingUserName: null,
      followingUserId: null,
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
            avatar: avatarConfig,
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
      avatar: avatarConfig,
      name: randomName,
    };
  } catch (err) {
    throw httpError(err);
  }
}
