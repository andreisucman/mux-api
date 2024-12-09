import { ObjectId } from "mongodb";
import { names } from "fancy-random-names";
import { uniqueNamesGenerator, adjectives } from "unique-names-generator";
import { defaultClubPrivacy } from "data/defaultClubPrivacy.js";
import doWithRetries from "helpers/doWithRetries.js";
import { UserType, ClubDataType, ClubBioType } from "types.js";
import { db } from "init.js";
import httpError from "@/helpers/httpError.js";

type Props = {
  userId: string;
  avatar: { [key: string]: any };
};

export default async function createClubProfile({ userId, avatar }: Props) {
  try {
    const userInfo = await doWithRetries(async () =>
      db
        .collection("User")
        .findOne(
          { _id: new ObjectId(userId) },
          { projection: { demographics: 1 } }
        )
    );

    if (!userInfo)
      throw httpError(`No user ${userId} found for checking club plan`);

    const { demographics } = (userInfo as unknown as Partial<UserType>) || {};
    const { sex } = demographics;

    const randomName = uniqueNamesGenerator({
      dictionaries: [adjectives, names],
      length: 2,
      style: "capital",
      separator: " ",
    });

    const defaultQuestions = [
      {
        asking: "coach",
        question:
          "What is your life philosophy? Are you outgoing or maybe introverted and love hanging out alone? Why? ",
      },
      {
        asking: "coach",
        question:
          "What are you aiming for when you groom and dress? Some aim to make a statement, others try to look clean and simple. What is that you are trying to convey?",
      },
      {
        asking: "coach",
        question: `How do you choose your ${
          sex === "male"
            ? "clothing and accessories"
            : "makeup, clothing and accessories"
        }? What are the colors, materials, size, or shapes you look for and avoid. Why?`,
      },
      {
        asking: "coach",
        question:
          "What are the places and brands you usually shop at and how frequently do you do that? Why you shop there?",
      },
      {
        asking: "coach",
        question:
          "Do you think you would have a different style if you were much fatter or thinner than your are now? Talk about whether weight matters for your current face and outfit style, and if yes, why?",
      },
      {
        asking: "coach",
        question:
          "Imagine that suddenly your ethnicity changed. Would you change anything in your outlook and why?",
      },
      {
        asking: "coach",
        question:
          "Imagine that you've been given a chance to be born again as an opposite sex. Describe how you look? Talk about height, weight, personality, facial features, etc.",
      },
    ];

    const clubBio: ClubBioType = {
      intro: "I love working out and eating healthy.",
      philosophy: "",
      style: "",
      tips: "",
      about: "",
      questions: defaultQuestions,
      socials: [],
    };

    const defaultClubData: ClubDataType = {
      followingUserId: "",
      bio: clubBio,
      name: randomName,
      avatar,
      isActive: false,
      payouts: {
        connectId: "",
        rewardFund: 0,
        oneShareAmount: 0,
        rewardEarned: 0,
        payoutsEnabled: false,
        detailsSubmitted: false,
        disabledReason: "",
      },
      privacy: defaultClubPrivacy,
      nextAvatarUpdateAt: null,
      nextNameUpdateAt: null,
    };

    await doWithRetries(async () =>
      db
        .collection("User")
        .updateOne(
          { _id: new ObjectId(userId) },
          { $set: { club: defaultClubData } }
        )
    );

    return defaultClubData;
  } catch (err) {
    throw httpError(err);
  }
}
