import { ObjectId } from "mongodb";
import { defaultClubPrivacy } from "data/defaultClubPrivacy.js";
import doWithRetries from "helpers/doWithRetries.js";
import {
  UserType,
  ClubPayoutDataType,
  ClubDataType,
  ClubBioType,
  ModerationStatusEnum,
} from "types.js";
import { db } from "init.js";
import { Sex } from "react-nice-avatar";
import getUserInfo from "./getUserInfo.js";
import createRandomName from "./createRandomName.js";
import httpError from "@/helpers/httpError.js";
import * as reactNiceAvatar from "react-nice-avatar";
import { AboutQuestionType } from "@/types/saveAboutResponseTypes.js";
import updateContentPublicity from "./updateContentPublicity.js";

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
  balance: 0,
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

    const defaultQuestions = [
      "What is your life philosophy? Are you outgoing or maybe love being alone? Why? ",
    ];

    const randomName = await createRandomName();

    const aboutQuestions: AboutQuestionType[] = defaultQuestions.map((q) => ({
      _id: new ObjectId(),
      question: q,
      userId: new ObjectId(userId),
      userName: randomName,
      updatedAt: new Date(),
      asking: "coach",
      skipped: false,
      answer: "",
      moderationStatus: ModerationStatusEnum.ACTIVE,
    }));

    const clubBio: ClubBioType = {
      intro: "I love working out and eating healthy.",
      philosophy: "",
      tips: "",
      nextRegenerateBio: {
        philosophy: null,
        tips: null,
      },
      socials: [],
    };

    const defaultClubData: ClubDataType = {
      followingUserName: null,
      followingUserId: null,
      bio: clubBio,
      payouts: defaultClubPayoutData,
      privacy: defaultClubPrivacy,
      totalFollowers: 0,
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
          },
        }
      )
    );

    await doWithRetries(async () =>
      db.collection("FaqAnswer").insertMany(aboutQuestions)
    );

    await updateContentPublicity({ userId, newPrivacy: defaultClubPrivacy });

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
