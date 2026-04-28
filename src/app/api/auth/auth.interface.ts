export type TLoginUser = {
  id: string;
  password: string;
};

export type TJwtPayload = {
  userId: string;
  role: string;
};

export type TChangePassword = {
  oldPassword: string;
  newPassword: string;
};

export type TResetPassword = {
  id: string;
  newPassword: string;
};
