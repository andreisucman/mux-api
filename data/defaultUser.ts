import {
  TypeEnum,
  PositionEnum,
  UserType,
  PartEnum,
  DemographicsType,
  NextActionType,
  ModerationStatusEnum,
} from "types.js";

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

export const defaultRequiredProgress = {
  head: [
    {
      type: TypeEnum.HEAD,
      position: PositionEnum.FRONT,
      part: PartEnum.FACE,
      title: "Progress: Head - front",
      instruction: "Take a photo of your head from the front.",
    },
    {
      type: TypeEnum.HEAD,
      position: PositionEnum.RIGHT,
      part: PartEnum.FACE,
      title: "Progress: Head - right",
      instruction: "Take a photo of your head from the right.",
    },
    {
      type: TypeEnum.HEAD,
      position: PositionEnum.LEFT,
      part: PartEnum.FACE,
      title: "Progress: Head - left",
      instruction: "Take a photo of your head from the left.",
    },
    {
      type: TypeEnum.HEAD,
      position: PositionEnum.FRONT,
      part: PartEnum.MOUTH,
      title: "Progress: Head - mouth",
      instruction: "Take a photo of your open mouth.",
    },
    {
      type: TypeEnum.HEAD,
      position: PositionEnum.FRONT,
      part: PartEnum.SCALP,
      title: "Progress: Head - scalp & hair",
      instruction: "Take a photo of your head from the top.",
    },
  ],
  body: [
    {
      type: TypeEnum.BODY,
      position: PositionEnum.FRONT,
      part: PartEnum.BODY,
      title: "Progress: Body - front",
      instruction:
        "Remove all clothes except underwear and take a full-height picture of your body from the front.",
    },
    {
      type: TypeEnum.BODY,
      position: PositionEnum.RIGHT,
      part: PartEnum.BODY,
      title: "Progress: Body - right",
      instruction:
        "Remove all clothes except underwear and take a full-hight picture of your body from the right.",
    },
    {
      type: TypeEnum.BODY,
      position: PositionEnum.LEFT,
      part: PartEnum.BODY,
      title: "Progress: Body - left",
      instruction:
        "Remove all clothes except underwear and take a full-hight picture of your body from the left.",
    },
    {
      type: TypeEnum.BODY,
      position: PositionEnum.BACK,
      part: PartEnum.BODY,
      title: "Progress: Body - back",
      instruction:
        "Remove all clothes except underwear and take a full-hight picture of your body from the back.",
    },
  ],
};

const defaultDemographics: DemographicsType = {
  sex: null,
  ageInterval: null,
  bodyType: null,
  ethnicity: null,
  skinType: null,
};

const defaultNextAction: NextActionType = [
  {
    type: TypeEnum.HEAD,
    date: null,
    parts: [
      { part: PartEnum.FACE, date: null },
      { part: PartEnum.MOUTH, date: null },
      { part: PartEnum.SCALP, date: null },
    ],
  },
  {
    type: TypeEnum.BODY,
    date: null,
    parts: [],
  },
  {
    type: TypeEnum.HEALTH,
    date: null,
    parts: [],
  },
];

const defaultStreaks = {
  faceStreak: 0,
  mouthStreak: 0,
  scalpStreak: 0,
  bodyStreak: 0,
  healthStreak: 0,
  clubFaceStreak: 0,
  clubMouthStreak: 0,
  clubScalpStreak: 0,
  clubBodyStreak: 0,
  clubHealthStreak: 0,
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
  latestStyleAnalysis: { head: null, body: null },
  demographics: defaultDemographics,
  currentlyHigherThan: {
    head: { overall: 0, face: 0, mouth: 0, scalp: 0 },
    body: { overall: 0, body: 0 },
  },
  potentiallyHigherThan: {
    head: { overall: 0, face: 0, mouth: 0, scalp: 0 },
    body: { overall: 0, body: 0 },
  },
  latestScores: {
    head: { overall: 0, face: 0, mouth: 0, scalp: 0 },
    body: { overall: 0, body: 0 },
  },
  latestScoresDifference: {
    head: { overall: 0, face: 0, mouth: 0, scalp: 0 },
    body: { overall: 0, body: 0 },
  },
  club: null,
  latestProgress: {
    head: { overall: 0, face: null, mouth: null, scalp: null },
    body: { overall: 0, body: null },
  },
  potential: {
    head: { overall: 0, face: null, mouth: null, scalp: null },
    body: { overall: 0, body: null },
  },
  ipFingerprint: null,
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
  toAnalyze: { head: [], body: [] },
  coachEnergy: 100000,
  nutrition: {
    dailyCalorieGoal: 0,
    recommendedDailyCalorieGoal: 0,
    remainingDailyCalories: 0,
  },
  canRejoinClubAfter: null,
  lastActiveOn: null,
  moderationStatus: ModerationStatusEnum.ACTIVE,
};
