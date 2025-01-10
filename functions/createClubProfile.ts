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

    const niceAvatar = await import("react-nice-avatar");
    const { genConfig } = niceAvatar;

    const avatarConfig = genConfig({
      sex: avatarSexMap[sex || "male"] as Sex,
      faceColor: avatarSkinColorMap[ethnicity],
      mouthStyle: "peace",
      glassesStyle: "none",
      hairColorRandom: true,
      isGradient: true,
    });

    const defaultQuestions = [
      "What is your life philosophy? Are you outgoing or maybe love being alone? Why? ",
      "Some aim to make a statement when they dress, others just put something on. How about you? Why?",
      `How do you choose your ${
        sex === "male"
          ? "clothing and accessories"
          : "makeup, clothing and accessories"
      }? What are the colors, materials, size, or shapes you look for and avoid. Why?`,
      "What are the places and brands you usually shop at and how frequently do you do that? Why do you shop there?",
      "Imagine you became much fatter than your are now. Describe how you adapt your style to your new weight. What type of clothing, colors, or brands would you change and why?",
      "Imagine you became much thinner than your are now. Describe how you adapt your style to your new weight. What type of clothing, colors, or brands would you change and why?",
      "Imagine that your ethnicity changed. Would you change anything in your outlook? Why?",
      `If you were ${
        sex === "male" ? "female" : "male"
      }, how would you look? Talk about height, weight, personality, facial features, etc.`,
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
      style: "",
      tips: "",
      nextRegenerateBio: {
        philosophy: null,
        style: null,
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

    return defaultClubData;
  } catch (err) {
    throw httpError(err.message, err.status);
  }
}
