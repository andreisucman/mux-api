import { ClubPayoutDataType } from "@/types.js";

export const validParts = ["face", "mouth", "scalp", "body"];
export const validPositions = ["front", "right", "left", "back"];

export const defaultClubPayoutData: ClubPayoutDataType = {
  connectId: null,
  balance: {
    pending: { amount: 0, currency: "" },
    available: { amount: 0, currency: "" },
  },
  payoutsEnabled: false,
  detailsSubmitted: false,
  disabledReason: null,
};
