import * as dotenv from "dotenv";
import {
  PositionEnum,
  UserType,
  PartEnum,
  DemographicsType,
  NextActionType,
  ModerationStatusEnum,
} from "types.js";

dotenv.config();

export const defaultSubscriptions = {
  improvement: {
    isTrialUsed: false,
    subscriptionId: null as string | null,
    validUntil: null as Date | null,
  },
  peek: {
    isTrialUsed: false,
    subscriptionId: null as string | null,
    validUntil: null as Date | null,
  },
  advisor: {
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
  peek: {
    isTrialUsed: true,
    subscriptionId: null as string | null,
    validUntil: null as Date | null,
  },
  advisor: {
    isTrialUsed: true,
    subscriptionId: null as string | null,
    validUntil: null as Date | null,
  },
};

export const defaultRequiredProgress = [
  {
    position: PositionEnum.FRONT,
    part: PartEnum.FACE,
    title: "Progress: Head - front",
    instruction: "Take a photo of your head from the front.",
  },
  {
    position: PositionEnum.RIGHT,
    part: PartEnum.FACE,
    title: "Progress: Head - right",
    instruction: "Take a photo of your head from the right.",
  },
  {
    position: PositionEnum.LEFT,
    part: PartEnum.FACE,
    title: "Progress: Head - left",
    instruction: "Take a photo of your head from the left.",
  },
  {
    position: PositionEnum.FRONT,
    part: PartEnum.MOUTH,
    title: "Progress: Head - mouth",
    instruction: "Take a photo of your open mouth.",
  },
  {
    position: PositionEnum.FRONT,
    part: PartEnum.SCALP,
    title: "Progress: Head - scalp & hair",
    instruction: "Take a photo of your head from the top.",
  },
  {
    position: PositionEnum.FRONT,
    part: PartEnum.BODY,
    title: "Progress: Body - front",
    instruction: "Take a full-height photo of your body from the front.",
  },
  {
    position: PositionEnum.RIGHT,
    part: PartEnum.BODY,
    title: "Progress: Body - right",
    instruction: "Take a full-height photo of your body from the right.",
  },
  {
    position: PositionEnum.LEFT,
    part: PartEnum.BODY,
    title: "Progress: Body - left",
    instruction: "Take a full-height photo of your body from the left.",
  },
  {
    position: PositionEnum.BACK,
    part: PartEnum.BODY,
    title: "Progress: Body - back",
    instruction: "Take a full-height photo of your body from the back.",
  },
];

export const defaultDemographics: DemographicsType = {
  sex: null,
  ageInterval: null,
  bodyType: null,
  ethnicity: null,
  skinType: null,
};

const defaultNextAction: NextActionType[] = [
  { part: PartEnum.FACE, date: null },
  { part: PartEnum.MOUTH, date: null },
  { part: PartEnum.SCALP, date: null },
  { part: PartEnum.BODY, date: null },
];

const defaultStreaks = {
  faceStreak: 0,
  mouthStreak: 0,
  scalpStreak: 0,
  bodyStreak: 0,
  clubFaceStreak: 0,
  clubMouthStreak: 0,
  clubScalpStreak: 0,
  clubBodyStreak: 0,
};

export const defaultLatestScores = {
  overall: 0,
  face: 0,
  mouth: 0,
  scalp: 0,
  body: 0,
};

export const defaultUser: UserType = {
  name: "",
  avatar: null,
  nextAvatarUpdateAt: null,
  nextDiaryRecordAfter: null,
  nextNameUpdateAt: null,
  email: "",
  auth: "",
  city: "",
  country: "",
  timeZone: "",
  timeZoneOffsetInMinutes: 0,
  deleteOn: null,
  stripeUserId: "",
  demographics: defaultDemographics,
  latestScores: defaultLatestScores,
  latestScoresDifference: defaultLatestScores,
  club: null,
  scanAnalysisQuota: 1,
  latestProgress: {
    overall: 0,
    face: null,
    mouth: null,
    scalp: null,
    body: null,
  },
  createdAt: new Date(),
  streaks: defaultStreaks,
  specialConsiderations: "",
  tosAccepted: false,
  nextScan: defaultNextAction,
  nextRoutine: defaultNextAction,
  streakDates: {
    default: {},
    club: {},
  },
  password: null,
  emailVerified: false,
  concerns: null,
  requiredProgress: defaultRequiredProgress,
  subscriptions: defaultSubscriptions,
  toAnalyze: [],
  coachEnergy: Number(process.env.COACH_ENERGY),
  nutrition: {
    dailyCalorieGoal: 2000,
    remainingDailyCalories: 2000,
  },
  canRejoinClubAfter: null,
  lastActiveOn: null,
  isPublic: false,
  moderationStatus: ModerationStatusEnum.ACTIVE,
};
