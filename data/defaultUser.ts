import * as dotenv from "dotenv";
import { UserType, PartEnum, DemographicsType, NextActionType, ModerationStatusEnum } from "types.js";

dotenv.config();

export const defaultSubscriptions = {
  improvement: {
    isTrialUsed: false,
    subscriptionId: null as string | null,
    validUntil: null as Date | null,
  },
};

export const defaultTriedSubscriptions = {
  improvement: {
    isTrialUsed: true,
    subscriptionId: null as string | null,
    validUntil: null as Date | null,
  },
};

export const defaultDemographics: DemographicsType = {
  sex: null,
  ageInterval: null,
  ethnicity: null,
  skinType: null,
};

const defaultNextAction: NextActionType[] = [
  { part: PartEnum.FACE, date: null },
  { part: PartEnum.HAIR, date: null },
];

const defaultStreaks = {
  faceStreak: 0,
  hairStreak: 0,
};

export const defaultLatestScores = {
  face: null,
  hair: null,
  body: null,
};

export const defaultUser: UserType = {
  name: "",
  avatar: null,
  nextAvatarUpdateAt: null,
  nextNameUpdateAt: null,
  email: "",
  auth: "",
  country: "",
  timeZone: "",
  timeZoneOffsetInMinutes: 0,
  deleteOn: null,
  stripeUserId: "",
  demographics: defaultDemographics,
  latestConcernScores: defaultLatestScores,
  latestConcernScoresDifference: defaultLatestScores,
  club: null,
  latestProgressImages: {
    face: null,
    hair: null,
    body: null,
  },
  createdAt: new Date(),
  streaks: defaultStreaks,
  specialConsiderations: "",
  tosAccepted: false,
  nextRoutine: defaultNextAction,
  nextScan: defaultNextAction,
  streakDates: {},
  password: null,
  emailVerified: false,
  concerns: null,
  subscriptions: defaultSubscriptions,
  toAnalyze: [],
  canRejoinClubAfter: null,
  lastActiveOn: null,
  isPublic: false,
  moderationStatus: ModerationStatusEnum.ACTIVE,
};
