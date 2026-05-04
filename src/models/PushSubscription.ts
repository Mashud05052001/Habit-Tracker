import mongoose, { Document, Model, Schema } from "mongoose";

export interface IUserPushSubscription extends Document {
  userId: string;
  endpoint: string;
  expirationTime: number | null;
  keys: {
    auth: string;
    p256dh: string;
  };
  userAgent: string;
  createdAt: Date;
  updatedAt: Date;
}

const PushSubscriptionSchema = new Schema<IUserPushSubscription>(
  {
    userId: { type: String, required: true, index: true },
    endpoint: { type: String, required: true, unique: true },
    expirationTime: { type: Number, default: null },
    keys: {
      auth: { type: String, required: true },
      p256dh: { type: String, required: true },
    },
    userAgent: { type: String, default: "" },
  },
  { timestamps: true },
);

PushSubscriptionSchema.index({ userId: 1, endpoint: 1 }, { unique: true });

export const UserPushSubscription: Model<IUserPushSubscription> =
  (mongoose.models.UserPushSubscription as Model<IUserPushSubscription>) ||
  mongoose.model<IUserPushSubscription>(
    "UserPushSubscription",
    PushSubscriptionSchema,
  );
