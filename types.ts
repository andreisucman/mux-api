import { ObjectId } from "mongodb";
import { Request } from "express";
import { ModerationResultType } from "./functions/moderateContent.js";

export type SuggestionType = {
  _id: string;
  type: "product" | "place";
  suggestion: string;
  asin: string;
  name: string;
  image: string;
  url: string;
  rating: number;
  description: string;
  priceAndUnit: string;
  vectorizedOn: Date;
  productFeatures?: string[];
};

export interface CustomRequest extends Request {
  userId?: string;
}

export type UserInfoType = {
  _id: ObjectId;
  name: string;
  timeZone: string;
  concerns: UserConcernType[];
  specialConsiderations: string;
  demographics: DemographicsType;
};

export type HigherThanType = {
  head: { overall: number; face: number; mouth: number; scalp: number };
  body: { overall: number; body: number };
};

export type NextActionType = { part: PartEnum; date: Date | null };

export type RequirementType = {
  title: string;
  instruction: string;
  part: PartEnum;
  position: PositionEnum;
};

export type FormattedRatingType = {
  explanations?: { feature: string; explanation: string }[];
} & {
  [key: string]: number;
};

export type LatestScoresType = {
  overall: number;
  face: FormattedRatingType;
  mouth: FormattedRatingType;
  scalp: FormattedRatingType;
  body: FormattedRatingType;
};

export type PurchaseType = {
  name: string;
  part: string;
  paid: number;
  subscribedUntil?: Date;
  subscriptionId?: string;
  transactionId: string;
  createdAt: Date;
  contentStartDate: Date;
  contentEndDate?: Date;
  sellerId: ObjectId;
  sellerName: string;
  sellerAvatar: { [key: string]: any };
  buyerId: ObjectId;
  buyerName: string;
  buyerAvatar: { [key: string]: any };
  routineDataId: ObjectId;
};

export type UserPurchaseType = {
  routineDataId: ObjectId;
  sellerId: ObjectId;
  contentEndDate: Date;
  subscribedUntl: Date;
};

export type UserType = {
  _id?: ObjectId;
  name: string;
  avatar: { [key: string]: any } | null;
  country: string;
  email: string;
  password: string | null;
  timeZone: string;
  timeZoneOffsetInMinutes: number;
  demographics: DemographicsType;
  auth: string;
  isPublic: boolean;
  createdAt: Date;
  latestScanImages?: string[];
  specialConsiderations: string;
  streaks: StreaksType;
  nextScan: NextActionType[];
  nextRoutine: NextActionType[];
  streakDates: {};
  concerns: UserConcernType[] | null;
  tosAccepted: boolean;
  requiredProgress: RequirementType[];
  latestScores: LatestScoresType;
  latestScoresDifference: LatestScoresType;
  latestProgress: LatestProgressType;
  club: ClubDataType;
  scanAnalysisQuota: number;
  deleteOn: Date;
  subscriptions: {
    improvement: SubscriptionType;
    advisor: SubscriptionType;
  };
  toAnalyze: ToAnalyzeType[];
  coachEnergy: number;
  stripeUserId: string;
  emailVerified: boolean;
  canRejoinClubAfter: Date | null;
  nextAvatarUpdateAt: Date | null;
  nextDiaryRecordAfter: { [key: string]: Date | null } | null;
  nextNameUpdateAt: Date | null;
  moderationStatus: ModerationStatusEnum;
  nutrition: {
    dailyCalorieGoal: number;
    remainingDailyCalories: number;
  };
  lastActiveOn: Date | null;
  purchases: UserPurchaseType[];
};

export type ToAnalyzeType = {
  createdAt: Date;
  mainUrl: BlurredUrlType;
  contentUrlTypes: BlurredUrlType[];
  position: string;
  part: PartEnum | null;
  blurType?: BlurTypeEnum;
  suspiciousAnalysisResults?: ModerationResultType[];
};

export enum SubscriptionTypeNamesEnum {
  IMPROVEMENT = "improvement",
  ADVISOR = "advisor",
}

export type SubscriptionType = {
  subscriptionId: string | null;
  validUntil: Date | null;
  isTrialUsed: boolean;
};

export type PrivacyType = {
  name: string;
  value: boolean;
  parts: { name: string; value: boolean }[];
};

export type ClubPayoutDataType = {
  connectId: string;
  balance: number;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string;
};

export type ClubDataType = {
  isActive: boolean;
  followingUserName: string;
  followingUserId: ObjectId;
  intro: string;
  socials: { value: string | null; label: string }[];
  payouts: ClubPayoutDataType;
  totalFollowers: number;
};

export type DemographicsType = {
  sex: SexEnum | null;
  ethnicity: EthnicityEnum | null;
  skinType: SkinTypeEnum | null;
  ageInterval: AgeIntervalEnum | null;
  bodyType: BodyTypeEnum | null;
};

export enum BlurTypeEnum {
  FACE = "face",
  EYES = "eyes",
  ORIGINAL = "original",
}

export enum PartEnum {
  FACE = "face",
  BODY = "body",
  MOUTH = "mouth",
  SCALP = "scalp",
}

export enum PositionEnum {
  FRONT = "front",
  BACK = "back",
  RIGHT = "right",
  LEFT = "left",
}

export enum SexEnum {
  MALE = "male",
  FEMALE = "female",
  ALL = "all",
}

export enum SkinColorEnum {
  TYPE1 = "fitzpatrick-1",
  TYPE2 = "fitzpatrick-2",
  TYPE3 = "fitzpatrick-3",
  TYPE4 = "fitzpatrick-4",
  TYPE5 = "fitzpatrick-5",
  TYPE6 = "fitzpatrick-6",
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

export enum TaskStatusEnum {
  ACTIVE = "active",
  COMPLETED = "completed",
  EXPIRED = "expired",
  CANCELED = "canceled",
  DELETED = "deleted",
  INACTIVE = "inactive",
}

export enum RoutineStatusEnum {
  ACTIVE = "active",
  INACTIVE = "inactive",
  DELETED = "deleted",
}

export type StreaksType = {
  faceStreak: number;
  mouthStreak: number;
  scalpStreak: number;
  bodyStreak: number;
};

export type UserConcernType = {
  name: string;
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

export enum ModerationStatusEnum {
  ACTIVE = "active",
  BLOCKED = "blocked",
  SUSPENDED = "suspended",
}

export enum CategoryNameEnum {
  TASKS = "tasks",
  PROGRESSSCAN = "progressScan",
  FOODSCAN = "foodScan",
  PRODUCTS = "products",
  ADVISOR = "advisor",
  FAQ = "faq",
  PROOF = "proof",
  DIARY = "diary",
  OTHER = "other",
}

export type ProgressType = {
  _id: ObjectId;
  userId: ObjectId;
  part: PartEnum;
  initialDate: Date;
  createdAt: Date;
  demographics: DemographicsType;
  concerns?: UserConcernType[];
  images: ProgressImageType[];
  initialImages: ProgressImageType[];
  scores?: FormattedRatingType;
  scoresDifference?: { [key: string]: any };
  specialConsiderations: string;
  isPublic: boolean;
  userName?: string;
  deletedOn?: Date;
  moderationStatus: ModerationStatusEnum;
};

export type FeatureAnalysisType = {
  feature: string;
  score: number;
  explanation: string;
};

export type LatestProgressType = {
  overall: number;
  face: ProgressType;
  mouth: ProgressType;
  scalp: ProgressType;
  body: ProgressType;
};

export type RecipeType = {
  canPersonalize: boolean;
  name: string;
  description: string;
  instruction: string;
  image: string;
};

export type TaskType = {
  _id: ObjectId;
  userId: ObjectId;
  routineId: ObjectId;
  userName: string;
  name: string;
  key: string;
  description: string;
  instruction: string;
  requisite: string;
  icon: string;
  color: string;
  part: PartEnum;
  status: TaskStatusEnum;
  concern: string;
  proofEnabled: boolean;
  proofId: string;
  isCreated: boolean;
  isDish: boolean;
  recipe: RecipeType | null;
  example: { type: string; url: string } | null;
  suggestions: SuggestionType[] | null;
  productTypes: string[] | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  completedAt: Date | null;
  nextCanStartDate: Date | null;
  restDays: number;
  embedding: number[];
  stolenFrom?: string;
};

export type RoutineType = {
  _id: ObjectId;
  userId: ObjectId;
  type: string;
  part: string;
  concerns: string[];
  finalSchedule: { [key: string]: any };
  status: RoutineStatusEnum;
  createdAt: Date;
  startsAt: Date;
  allTasks: AllTaskTypeWithIds[];
  lastDate: Date;
  stolenFrom: string;
  userName: string;
  isPublic: boolean;
};

export type ConcernType = {
  name: string;
  parts: PartEnum[];
  sex: SexEnum;
};

export type AllTaskType = {
  name: string;
  color: string;
  key: string;
  icon: string;
  concern: string;
  total: number;
  description: string;
  instruction: string;
};

export interface AllTaskTypeWithIds extends AllTaskType {
  ids: { _id: ObjectId; startsAt: Date; status: TaskStatusEnum }[];
}

export type BeforeAfterType = {
  initialDate: Date;
  updatedAt: Date;
  demographics: DemographicsType;
  concerns?: UserConcernType[];
  images: ProgressImageType[];
  initialImages: ProgressImageType[];
  scores?: { [key: string]: any };
  scoresDifference?: { [key: string]: any };
  latestBodyScoreDifference?: number;
  latestHeadScoreDifference?: number;
  isPublic: boolean;
  avatar?: { [key: string]: any };
  userName?: string;
  part: PartEnum;
  progresses?: { progressId: ObjectId; createdAt: Date }[];
};

export type ProofType = {
  _id: ObjectId;
  taskName: string;
  requisite: string;
  userId: ObjectId;
  routineId: ObjectId;
  createdAt: Date;
  taskKey: string;
  contentType: "video" | "image";
  mainUrl: BlurredUrlType;
  mainThumbnail: BlurredUrlType;
  part: PartEnum;
  icon: string;
  color: string;
  taskId: ObjectId;
  concern: string;
  proofImages: string[];
  userName: string;
  moderationStatus: ModerationStatusEnum;
  isPublic: boolean;
  deletedOn?: Date;
};

export type SolutionType = {
  _id: string;
  key: string;
  name: string;
  icon: string;
  color: string;
  instruction: string;
  description: string;
  suggestions: SuggestionType[];
  productTypes: string[];
  nearestConcerns: string[];
  embedding: number[];
  isDish: boolean;
  recipe: RecipeType | null;
  restDays: number;
};
