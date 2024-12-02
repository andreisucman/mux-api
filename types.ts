import { ObjectId } from "mongodb";
import { Request } from "express";

export interface CustomRequest extends Request {
  userId?: string;
}

export type UserInfoType = {
  _id: ObjectId;
  timeZone: string;
  concerns: UserConcernType[];
  specialConsiderations: string;
  demographics: DemographicsType;
};

export type HigherThanType = {
  head: { overall: number; face: number; mouth: number; scalp: number };
  body: { overall: number; body: number };
  health: { overall: number; health: number };
};

export type NextActionType = {
  type: TypeEnum;
  date: Date | null;
  parts: { part: PartEnum; date: Date | null }[];
}[];

export type ProgressRequirement = {
  title: string;
  instruction: string;
  type: TypeEnum;
  position: PositionEnum;
};

export type UserPotentialRecordType = {
  head: {
    overall: number;
    face: FormattedRatingType;
    mouth: FormattedRatingType;
    scalp: FormattedRatingType;
  };
  body: { overall: number; body: FormattedRatingType };
  health: { overall: number; health: FormattedRatingType };
};

export type FormattedRatingType = {
  explanations?: { feature: string; explanation: string }[];
} & {
  [key: string]: number;
};

export type UserType = {
  _id?: ObjectId;
  city: string;
  country: string;
  email: string;
  timeZone: string;
  demographics: DemographicsType;
  auth: string;
  createdAt: Date;
  fingerprint: number;
  specialConsiderations: string;
  streaks: StreaksType;
  latestProgress: UserProgressRecordType;
  currentlyHigherThan: HigherThanType;
  potentiallyHigherThan: HigherThanType;
  nextScan: NextActionType;
  nextRoutine: NextActionType;
  streakDates: {
    default: {
      [key: string]: Date;
    };
    club: {
      [key: string]: Date;
    };
  };
  concerns: UserConcernType[];
  potential: UserPotentialRecordType;
  tosAccepted: boolean;
  requiredProgress: {
    head: ProgressRequirement[];
    body: ProgressRequirement[];
    health: ProgressRequirement[];
  };
  styleRequirements: {
    head: ProgressRequirement[];
    body: ProgressRequirement[];
  };
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
  club: ClubDataType;
  deleteOn: Date;
  subscriptions: {
    improvement: SubscriptionType;
    peek: SubscriptionType;
    advisor: SubscriptionType;
    analyst: SubscriptionType;
  };
  latestStyleAnalysis: {
    head: StyleAnalysisType | null;
    body: StyleAnalysisType | null;
  };
  toAnalyze: {
    head: ToAnalyzeType[];
    body: ToAnalyzeType[];
    health: ToAnalyzeType[];
  };
  coachEnergy: number;
  stripeUserId: string;
  isBlocked: boolean;
};

export type ToAnalyzeType = {
  type: TypeEnum | null;
  createdAt: Date;
  mainUrl: BlurredUrlType;
  contentUrlTypes: BlurredUrlType[];
  position: string;
  part: PartEnum | null;
  blurType: BlurTypeEnum;
};

export type StyleAnalysisType = {
  _id: ObjectId;
  userId: ObjectId;
  createdAt: Date;
  compareDate: Date;
  mainUrl: BlurredUrlType;
  compareMainUrl: BlurredUrlType;
  urls: BlurredUrlType[];
  compareUrls: BlurredUrlType[];
  votes: number;
  compareVotes: number;
  demographics: DemographicsType;
  type: TypeEnum;
  goal: StyleGoalsType | null;
  hash: string;
  styleName: string;
  compareStyleName: string;
  currentDescription: string;
  currentSuggestion: string;
  matchSuggestion: string;
  isPublic: boolean;
  latestHeadScoreDifference: number;
  latestBodyScoreDifference: number;
  analysis: { [key: string]: number } | null;
  compareAnalysis: { [key: string]: number } | null;
  clubName: string | null;
  avatar: { [key: string]: any } | null;
};

export type StyleGoalsType = {
  name: string;
  description: string;
  icon: string;
};

export type SubscriptionType = {
  subscriptionId: string;
  validUntil: Date | null;
  isTrialUsed: boolean;
};

export type PrivacyType = {
  name: string;
  value: boolean;
  parts: { name: string; value: boolean }[];
};

export type ClubDataType = {
  trackedUserId: string;
  bio: {
    intro: string;
    philosophy: string;
    style: string;
    tips: string;
    about: string;
    questions: { asking: string; question: string }[];
  };
  name: string;
  avatar: { [key: string]: any } | null;
  isActive: boolean;
  payouts: {
    connectId: string;
    rewardFund: number;
    oneShareAmount: number;
    rewardEarned: number;
    payoutsEnabled: boolean;
    detailsSubmitted: boolean;
    disabledReason: string;
  };
  privacy: PrivacyType[];
  nextAvatarUpdateAt: Date | null;
  nextNameUpdateAt: Date | null;
};

export type LatestScoresType = {
  head: {
    overall: number;
    face: number;
    mouth: number;
    scalp: number;
  } | null;
  body: { overall: number; body: number } | null;
  health: { overall: number; health: number } | null;
};

export type DemographicsType = {
  sex: SexEnum | null;
  skinColor: SkinColorEnum | null;
  ethnicity: EthnicityEnum | null;
  skinType: SkinTypeEnum | null;
  ageInterval: AgeIntervalEnum | null;
  bodyType: BodyTypeEnum | null;
};

export enum SexEnum {
  MALE = "male",
  FEMALE = "female",
  ALL = "all",
}

export enum BlurTypeEnum {
  FACE = "face",
  EYES = "eyes",
  ORIGINAL = "original",
}

export enum SkinColorEnum {
  TYPE1 = "fitzpatrick-1",
  TYPE2 = "fitzpatrick-2",
  TYPE3 = "fitzpatrick-3",
  TYPE4 = "fitzpatrick-4",
  TYPE5 = "fitzpatrick-5",
  TYPE6 = "fitzpatrick-6",
}

export enum PositionEnum {
  FRONT = "front",
  BACK = "back",
  RIGHT = "right",
  LEFT = "left",
  MOUTH = "mouth",
  SCALP = "scalp",
}

export enum EthnicityEnum {
  WHITE = "white",
  ASIAN = "asian",
  BLACK = "black",
  HISPANIC = "hispanic",
  ARAB = "arab",
  SOUTH_ASIAN = "south_asian",
  NATIVE_AMERICAN = "native_american",
}

export enum SkinTypeEnum {
  DRY = "dry",
  OILY = "oily",
  NORMAL = "normal",
}

export enum AgeIntervalEnum {
  "18-24" = "18-24",
  "24-30" = "24-30",
  "30-36" = "30-36",
  "36-42" = "36-42",
  "42-48" = "42-48",
  "48-56" = "48-56",
  "56-64" = "56-64",
  "64+" = "64+",
}

export enum BodyTypeEnum {
  ECTOMORPH = "ectomorph",
  MESOMORPH = "mesomorph",
  ENDOMORPH = "endomorph",
}

export enum TypeEnum {
  HEAD = "head",
  BODY = "body",
  HEALTH = "health",
}

export enum PartEnum {
  FACE = "face",
  BODY = "body",
  MOUTH = "mouth",
  SCALP = "scalp",
}

export enum TaskStatusEnum {
  ACTIVE = "active",
  COMPLETED = "completed",
  EXPIRED = "expired",
  CANCELED = "canceled",
}

export enum RoutineStatusEnum {
  ACTIVE = "active",
  INACTIVE = "inactive",
  REPLACED = "replaced",
}

export type StreaksType = {
  faceStreak: number;
  mouthStreak: number;
  scalpStreak: number;
  bodyStreak: number;
  healthStreak: number;
  clubFaceStreak: number;
  clubMouthStreak: number;
  clubScalpStreak: number;
  clubBodyStreak: number;
  clubHealthStreak: number;
};

export type UserConcernType = {
  name: string;
  type: TypeEnum;
  part: PartEnum;
  explanation: string;
  importance: number;
  isDisabled: boolean;
  imported?: boolean;
};

export type BlurredUrlType = {
  name: "original" | "eyes" | "face";
  url: string;
};

export type ProgressImageType = {
  position: string;
  mainUrl: BlurredUrlType;
  urls: BlurredUrlType[];
};

export type ProgressType = {
  _id: ObjectId;
  userId: ObjectId;
  type: TypeEnum;
  part: PartEnum;
  initialDate: Date;
  createdAt: Date;
  demographics: DemographicsType;
  concerns: UserConcernType[];
  images: ProgressImageType[];
  initialImages: ProgressImageType[];
  scores: { [key: string]: any };
  scoresDifference: { [key: string]: any };
  specialConsiderations: string;
  isPublic: boolean;
  avatar?: { [key: string]: any };
  clubName?: string;
};

export type UserProgressRecordType = {
  head: {
    overall: number;
    face: ProgressType;
    mouth: ProgressType;
    scalp: ProgressType;
  };
  body: { overall: number; body: ProgressType };
  health: { overall: number; health: ProgressType };
};

export type RecipeType = {
  canPersonalize: boolean;
  name: string;
  description: string;
  instruction: string;
  image: string;
  calories: number;
};

export type SuggestionType = {
  itemId: string;
  asin: string;
  name: string;
  url: string;
  type: "product" | "place";
  image: string;
  description: string;
  rating: number;
  suggestion: string;
  variant: string;
  rank: number;
  reasoning: string;
  analysisResult: { [key: string]: boolean } | null;
  key: string;
};

export type RequiredSubmissionType = {
  submissionId: string;
  name: string;
  proofId: string;
  dayTime: "morning" | "noon" | "evening";
  isSubmitted: boolean;
};

export type TaskType = {
  _id: ObjectId;
  userId: ObjectId;
  routineId: ObjectId;
  name: string;
  key: string;
  productsPersonalized: boolean;
  description: string;
  instruction: string;
  requisite: string;
  icon: string;
  color: string;
  type: TypeEnum;
  part: PartEnum;
  status: TaskStatusEnum;
  concern: string;
  proofEnabled: boolean;
  isCreated: boolean;
  isRecipe: boolean;
  recipe: RecipeType | null;
  example: { type: string; url: string } | null;
  suggestions: SuggestionType[] | null;
  defaultSuggestions: SuggestionType[] | null;
  productTypes: string[] | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  completedAt?: Date;
  nextCanStartDate: Date | null;
  restDays: number;
  requiredSubmissions: RequiredSubmissionType[] | null;
  revisionDate: Date | null;
};

export type RoutineType = {
  _id: ObjectId;
  userId: ObjectId;
  type: string;
  concerns: ConcernType[];
  finalSchedule: { [key: string]: any };
  status: RoutineStatusEnum;
  createdAt: Date;
  allTasks: AllTaskType[];
  lastDate: Date;
};

export type ConcernType = {
  name: string;
  key: string;
  types: TypeEnum[];
  parts: PartEnum[];
  sex: SexEnum;
};

export type AllTaskType = {
  name: string;
  color: string;
  description: string;
  instruction: string;
  key: string;
  icon: string;
  part: PartEnum;
  total: number;
  completed: number;
  unknown: number;
  concern: string;
};

export type BeforeAfterType = {
  initialDate: Date;
  updatedAt: Date;
  demographics: DemographicsType;
  concerns: UserConcernType[];
  images: ProgressImageType[];
  initialImages: ProgressImageType[];
  scores: { [key: string]: any };
  scoresDifference: { [key: string]: any };
  isPublic: boolean;
  avatar?: { [key: string]: any };
  clubName?: string;
};
