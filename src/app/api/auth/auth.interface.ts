export type TRegisterUser = {
  name: string;
  email: string;
  password: string;
  confirmPassword: string;
};

export type TLoginUser = {
  email: string;
  password: string;
};

export type TPublicUser = {
  id: string;
  name: string;
  email: string;
  isVerified: boolean;
};

export type TSessionUser = TPublicUser & {
  isVerified: true;
};

export type TSessionTokenPayload = {
  type: "session";
  userId: string;
  email: string;
  name: string;
};

export type TVerificationTokenPayload = {
  type: "verify-email";
  userId: string;
  email: string;
  nonce: string;
};

export type TRegisterResult = {
  user: TPublicUser;
  emailDelivered: boolean;
  verificationExpiresAt: string;
  verificationUrl?: string;
  emailPreviewUrl?: string;
};
