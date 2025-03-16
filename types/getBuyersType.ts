import { ObjectId } from "mongodb";

export type BuyerType = {
  _id: 1;
  sellerId: ObjectId;
  parts: {
    part: string;
    paid: number;
    subscribed: boolean;
    transactionId: string;
  }[];
  createdAt: Date;
  buyerId: ObjectId;
  buyerName: string;
  buyerAvatar: { [key: string]: any };
};
