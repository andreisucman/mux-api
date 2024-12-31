export type AuthDataType = {
  name: string;
  email: string;
  id_token: string;
  accessToken: string;
  refreshToken: string;
};

export enum ReferrerEnum {
  SCAN_FOOD = "scanFood",
  ANALYSIS_STYLE = "analysisStyleResult",
  ANALYSIS_PROGRESS = "analysisProgress",
  CLUB_ROUTINES = "clubRoutines",
  CLUB_ABOUT = "clubAbout",
  CLUB_DIARY = "clubDiary",
  CLUB_PROGRESS = "clubProgress",
  CLUB_STYLE = "clubStyle",
  CLUB_PROOF = "clubProof",
  AUTH_PAGE = "authPage",
  SCAN_INDEX = "scanIndex",
  PLANS = "plans",
  REWARDS = "rewards",
}
