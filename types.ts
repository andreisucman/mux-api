import { ObjectId } from "mongodb";
import { Request } from "express";
import { ModerationResultType } from "./functions/moderateContent.js";
import { TaskExampleType } from "./types/createRoutineTypes.js";

export interface CustomRequest extends Request {
  userId?: string;
  timeZone?: string;
}

export type UserInfoType = {
  _id: ObjectId;
  name: string;
  timeZone: string;
  concerns: UserConcernType[];
  specialConsiderations: string;
  demographics: DemographicsType;
};

export type NextActionType = { part: PartEnum; date: Date | null };

export type RequirementType = {
  title: string;
  instruction: string;
  part: PartEnum;
};

export enum AnalysisStatusEnum {
  ROUTINE = "routine",
  ANALYSIS = "analysis",
  ROUTINE_SUGGESTION = "routineSuggestion",
}

export type ScoreType = {
  value: number;
  explanation: string;
  name: string;
};

export type LatestScoresType = {
  [key: string]: ScoreType[];
};

export type ScoreDifferenceType = {
  value: number;
  name: string;
};

export type LatestScoresDifferenceType = {
  [key: string]: ScoreDifferenceType[];
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
  specialConsiderations: string;
  streaks: StreaksType;
  nextScan: NextActionType[];
  nextRoutine: NextActionType[];
  nextRoutineSuggestion: NextActionType[];
  streakDates: {};
  latestProgressImages: LatestProgressImagesType;
  concerns: UserConcernType[] | null;
  tosAccepted: boolean;
  latestConcernScores: LatestScoresType;
  latestConcernScoresDifference: LatestScoresDifferenceType;
  club: ClubDataType;
  deleteOn: Date;
  toAnalyze: ToAnalyzeType[];
  stripeUserId: string;
  emailVerified: boolean;
  canRejoinClubAfter: Date | null;
  nextAvatarUpdateAt: Date | null;
  nextNameUpdateAt: Date | null;
  moderationStatus: ModerationStatusEnum;
  lastActiveOn: Date | null;
};

export type ToAnalyzeType = {
  createdAt: Date;
  mainUrl: BlurredUrlType;
  updateUrl: BlurredUrlType;
  contentUrlTypes: BlurredUrlType[];
  part: PartEnum | null;
  blurType?: BlurTypeEnum;
  suspiciousAnalysisResults?: ModerationResultType[];
};

export enum SubscriptionTypeNamesEnum {
  IMPROVEMENT = "improvement",
}

export type SubscriptionType = {
  subscriptionId: string | null;
  validUntil: Date | null;
  isTrialUsed: boolean;
};

export type ClubPayoutDataType = {
  connectId: string;
  balance: number;
  payoutsEnabled: boolean;
  detailsSubmitted: boolean;
  disabledReason: string;
  lastTransferDate: Date | null;
  minPayoutAmount: number;
};

export type ClubDataType = {
  isActive: boolean;
  intro: string;
  socials: { value: string | null; label: string }[];
  payouts: ClubPayoutDataType;
};

export type DemographicsType = {
  sex: SexEnum | null;
  ethnicity: EthnicityEnum | null;
  skinType: SkinTypeEnum | null;
  ageInterval: AgeIntervalEnum | null;
};

export enum BlurTypeEnum {
  ORIGINAL = "original",
  BLURRED = "blurred",
}

export enum PartEnum {
  FACE = "face",
  HAIR = "hair",
  BODY = "body",
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

export enum TaskStatusEnum {
  ACTIVE = "active",
  COMPLETED = "completed",
  EXPIRED = "expired",
  CANCELED = "canceled",
}

export enum RoutineStatusEnum {
  ACTIVE = "active",
  EXPIRED = "expired",
  CANCELED = "canceled",
}

export type StreaksType = {
  faceStreak: number;
  hairStreak: number;
  bodyStreak: number;
};

export type UserConcernType = {
  name: string;
  part: PartEnum;
};

export type BlurredUrlType = {
  name: "original" | "blurred";
  url: string;
};

export type ProgressImageType = {
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
  SCAN = "scan",
  PRODUCTS = "products",
  PROOF = "proof",
  DIARY = "diary",
  OTHER = "other",
}

export type LatestProgressImagesType = {
  [key: string]: ProgressImageType[];
};

export type ProgressType = {
  _id: ObjectId;
  userId: ObjectId;
  part: PartEnum;
  initialDate: Date;
  createdAt: Date;
  isPublic: boolean;
  demographics: DemographicsType;
  images: ProgressImageType[];
  initialImages: ProgressImageType[];
  concernScores?: ScoreType[];
  concernScoresDifference?: ScoreDifferenceType[];
  specialConsiderations: string;
  concerns: string[];
  userName?: string;
  deletedOn?: Date;
  moderationStatus: ModerationStatusEnum;
};

export type LatestProgressType = {
  face: ProgressType;
  hair: ProgressType;
  body: ProgressType;
};

export type RecipeType = {
  canPersonalize: boolean;
  name: string;
  description: string;
  instruction: string;
  productTypes: string[];
  examples: { type: string; url: string }[];
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
  isFood: boolean;
  requiresProof: boolean;
  previousRecipe: RecipeType | null;
  examples: TaskExampleType[];
  productTypes: string[] | null;
  startsAt: Date | null;
  expiresAt: Date | null;
  completedAt: Date | null;
  restDays: number;
  copiedFrom?: string;
};

export type RoutineType = {
  _id: ObjectId;
  userId: ObjectId;
  part: string;
  concerns: string[];
  status: RoutineStatusEnum;
  createdAt: Date;
  startsAt: Date;
  allTasks: AllTaskTypeWithIds[];
  lastDate: Date;
  copiedFrom?: string;
  userName?: string;
  isPublic: boolean;
  deletedOn?: Date;
};

export type ConcernType = {
  name: string;
  parts: PartEnum[];
  tags: string[];
};

export type AllTaskType = {
  name: string;
  color: string;
  key: string;
  icon: string;
  concern: string;
  total: number;
};

export type AllTaskIdType = {
  _id: ObjectId;
  startsAt: Date;
  status: TaskStatusEnum;
  deletedOn?: Date;
};

export interface AllTaskTypeWithIds extends AllTaskType {
  ids: AllTaskIdType[];
}

export type BeforeAfterType = {
  initialDate: Date;
  updatedAt: Date;
  demographics: DemographicsType;
  images: ProgressImageType[];
  initialImages: ProgressImageType[];
  concernScore?: ScoreType;
  concernScoreDifference?: ScoreDifferenceType;
  isPublic: boolean;
  concern: string;
  avatar?: { [key: string]: any };
  userName?: string;
  userId: ObjectId;
  routineName?: string;
  part: PartEnum;
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
