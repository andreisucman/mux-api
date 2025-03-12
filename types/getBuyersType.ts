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

export type PurchaseType = {
  _id: ObjectId;
  name: string;
  part: string;
  paid: number;
  isSubscribed: boolean;
  transactionId: string;
  createdAt: Date;
  buyerId: string;
  sellerId: ObjectId;
  sellerName: string;
  sellerAvatar: { [key: string]: any };
};
