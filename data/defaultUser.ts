import {
  TypeEnum,
  PositionEnum,
  UserType,
  PartEnum,
  DemographicsType,
  NextActionType,
} from "types.js";

export const defaultSubscriptions = {
  improvement: {
    isTrialUsed: false,
    subscriptionId: "",
    validUntil: null as Date | null,
  },
  peek: {
    isTrialUsed: false,
    subscriptionId: "",
    validUntil: null as Date | null,
  },
  analyst: {
    isTrialUsed: false,
    subscriptionId: "",
    validUntil: null as Date | null,
  },
  advisor: {
    isTrialUsed: false,
    subscriptionId: "",
    validUntil: null as Date | null,
  },
};

export const defaultRequiredProgress = {
  head: [
    {
      type: "head" as TypeEnum,
      position: "front" as PositionEnum,
      part: "face" as PartEnum,
      title: "Progress: Head - front",
      instruction: "Take a photo of your head from the front.",
    },
    {
      type: "head" as TypeEnum,
      position: "right" as PositionEnum,
      part: "face" as PartEnum,
      title: "Progress: Head - right",
      instruction: "Take a photo of your head from the right.",
    },
    {
      type: "head" as TypeEnum,
      position: "left" as PositionEnum,
      part: "face" as PartEnum,
      title: "Progress: Head - left",
      instruction: "Take a photo of your head from the left.",
    },
    {
      type: "head" as TypeEnum,
      position: "mouth" as PositionEnum,
      part: "mouth" as PartEnum,
      title: "Progress: Head - mouth",
      instruction: "Take a photo of your open mouth.",
    },
    {
      type: "head" as TypeEnum,
      position: "scalp" as PositionEnum,
      part: "scalp" as PartEnum,
      title: "Progress: Head - scalp & hair",
      instruction: "Take a photo of your head from the top.",
    },
  ],
  body: [
    {
      type: "body" as TypeEnum,
      position: "front" as PositionEnum,
      part: "body" as PartEnum,
      title: "Progress: Body - front",
      instruction: "Take a full-height picture of your body from the front.",
    },
    {
      type: "body" as TypeEnum,
      position: "right" as PositionEnum,
      part: "body" as PartEnum,
      title: "Progress: Body - right",
      instruction: "Take a full-hight picture of your body from the right.",
    },
    {
      type: "body" as TypeEnum,
      position: "left" as PositionEnum,
      part: "body" as PartEnum,
      title: "Progress: Body - left",
      instruction: "Take a full-hight picture of your body from the left.",
    },
    {
      type: "body" as TypeEnum,
      position: "back" as PositionEnum,
      part: "body" as PartEnum,
      title: "Progress: Body - back",
      instruction: "Take a full-hight picture of your body from the back.",
    },
  ],
  health: [
    {
      type: "health" as TypeEnum,
      title: "Analysis upload",
      position: "health" as PositionEnum,
      part: "health",
      instruction: "Upload an image or PDF file of your lab analysis.",
    },
  ],
};

export const defaultStyleRequirements = {
  head: [
    {
      type: "head" as TypeEnum,
      part: "face" as PartEnum,
      position: "front" as PositionEnum,
      title: "Style scan: Head",
      instruction: "Upload a photo of your head how you usually style it",
    },
  ],
  body: [
    {
      type: "body" as TypeEnum,
      part: "body" as PartEnum,
      position: "front" as PositionEnum,
      title: "Style scan: Outfit",
      instruction: "Upload a photo of yourself in your usual outfit",
    },
  ],
};

const defaultDemographics: DemographicsType = {
  sex: null,
  skinColor: null,
  ageInterval: null,
  bodyType: null,
  ethnicity: null,
  skinType: null,
};

const defaultNextAction: NextActionType = [
  {
    type: "head" as TypeEnum,
    date: null,
    parts: [
      { part: "face" as PartEnum, date: null },
      { part: "mouth" as PartEnum, date: null },
      { part: "scalp" as PartEnum, date: null },
    ],
  },
  {
    type: "body" as TypeEnum,
    date: null,
    parts: [],
  },
  {
    type: "health" as TypeEnum,
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
  email: "",
  auth: "",
  city: "",
  country: "",
  timeZone: "",
  deleteOn: null,
  stripeUserId: "",
  latestStyleAnalysis: { head: null, body: null },
  demographics: defaultDemographics,
  currentlyHigherThan: {
    head: { overall: 0, face: 0, mouth: 0, scalp: 0 },
    body: { overall: 0, body: 0 },
    health: { overall: 0, health: 0 },
  },
  potentiallyHigherThan: {
    head: { overall: 0, face: 0, mouth: 0, scalp: 0 },
    body: { overall: 0, body: 0 },
    health: { overall: 0, health: 0 },
  },
  latestScores: {
    head: { overall: 0, face: 0, mouth: 0, scalp: 0 },
    body: { overall: 0, body: 0 },
    health: { overall: 0, health: 0 },
  },
  latestScoresDifference: {
    head: { overall: 0, face: 0, mouth: 0, scalp: 0 },
    body: { overall: 0, body: 0 },
    health: { overall: 0, health: 0 },
  },
  club: null,
  latestProgress: {
    head: { overall: 0, face: null, mouth: null, scalp: null },
    body: { overall: 0, body: null },
    health: { overall: 0, health: null },
  },
  potential: {
    head: { overall: 0, face: null, mouth: null, scalp: null },
    body: { overall: 0, body: null },
    health: { overall: 0, health: null },
  },
  fingerprint: 0,
  createdAt: new Date(),
  streaks: defaultStreaks,
  specialConsiderations: "",
  tosAccepted: false,
  isBlocked: false,
  nextScan: defaultNextAction,
  nextRoutine: defaultNextAction,
  streakDates: {
    default: {},
    club: {},
  },
  password: null,
  emailVerified: false,
  concerns: [],
  requiredProgress: defaultRequiredProgress,
  styleRequirements: defaultStyleRequirements,
  subscriptions: defaultSubscriptions,
  toAnalyze: { head: [], body: [], health: [] },
  coachEnergy: 100000,
};
