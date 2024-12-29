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
import getUserInfo from "./getUserInfo.js";
import createRandomName from "./createRandomName.js";
import httpError from "@/helpers/httpError.js";
import { AboutQuestionType } from "@/types/saveAboutResponseTypes.js";

type Props = {
  userId: string;
  avatar: { [key: string]: any };
};

export const defaultClubPayoutData: ClubPayoutDataType = {
  connectId: null,
  balance: 0,
  payoutsEnabled: false,
  detailsSubmitted: false,
  disabledReason: null,
};

export default async function createClubProfile({ userId, avatar }: Props) {
  try {
    const userInfo = await getUserInfo({
      userId,
      projection: { demographics: 1 },
    });

    if (!userInfo) throw httpError(`User ${userId} not found`);

    const { demographics } = (userInfo as unknown as Partial<UserType>) || {};
    const { sex } = demographics;

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
      isPublic: false,
      skipped: false,
      answer: null as string | null,
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
            avatar,
          },
        }
      )
    );

    await doWithRetries(async () =>
      db.collection("About").insertMany(aboutQuestions)
    );

    return defaultClubData;
  } catch (err) {
    throw httpError(err);
  }
}
