/* eslint-disable @typescript-eslint/no-unused-vars */
import {
  createToken,
  generateHashedPassword,
  verifyAccessToken,
  verifyRefrestToken,
} from './auth.utils';
import { resetPasswordEmail } from './auth.constant';
import jwt, { JwtPayload } from 'jsonwebtoken';
import sendEmail from '../../utils/sendEmail';
import AppError from '../../errors/AppError';
import { User } from '../user/user.model';
import httpStatus from 'http-status';
import config from '../../config';
import {
  TChangePassword,
  TJwtPayload,
  TLoginUser,
  TResetPassword,
} from './auth.interface';

/*
Login
1. Check the user existancy , (isDeleted or not) & (blocked or not)
2. Checking the password matched or not
3. Create access token & refresh token using different time & secret.
4. Send the access token from res.json({..}) but
5. Send the refresh token using cookie like res.cookie(....)


Change Password
1. Token comes from the headers & (oldPassword, newPassword) comes from the body
2. Go the the auth validator & check all condition. set the userInfo into req.user
3. Check the user existancy , (isDeleted or not) & (blocked or not) from req.user.userId
4. Check the oldPassword is matched or not with the DB saved old password
5. make a hashed password 
6. update password into db


Refresh Token => 
  Whenever the access token will expired using the refresh token automatically generate a new access token from the client side & all works in behind the scene. But whenever the refresh token expired the user will automatically log out from the website

1. Refresh token will provide as cookies like req.cookies
2. Validate the refresh token & find the decoded data.
3. From decoded userId check the user existancy , (isDeleted or not) & (blocked or not)
4. Check the token is before updating the password or not.
5. Create a access token & send it to client side


Forget Password
1. Check the user existancy , (isDeleted or not) & (blocked or not)
2. Create an access token for short time like 5-20 minutes (5m, 10m, 20m)
3. make a resetUrl & resetEmail(html)
4. Send the email using nodemailer


Reset Password
1. Check the token availability
2. Check the user existancy , (isDeleted or not) & (blocked or not)
3. Check the token userId === provided id cause an user cannot reset another user 
   password  with the token
4. make a hashed password 
5. update password into db
*/

const loginUser = async (payload: TLoginUser) => {
  const user = await User.isUserExistByCustomId(payload.id, true);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found !');
  }

  const isDeleted = user?.isDeleted;
  if (isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is deleted !');
  }

  const isBlocked = user?.status === 'blocked';
  if (isBlocked) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked ! !');
  }

  if (!(await User.isPasswordMatched(payload.password, user?.password))) {
    throw new AppError(httpStatus.FORBIDDEN, `Password doesn't matched`);
  }

  const jwtPayload = {
    userId: user?.id,
    role: user?.role,
  };
  const accessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_access_expires_in as string,
  );
  const refreshToken = createToken(
    jwtPayload,
    config.jwt_refresh_secret as string,
    config.jwt_refresh_expires_in as string,
  );

  return {
    accessToken,
    refreshToken,
    needsPasswordChange: user?.needsPasswordChange,
  };
};

const changePassword = async (
  userData: JwtPayload,
  payload: TChangePassword,
) => {
  const user = await User.isUserExistByCustomId(userData.userId, true);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found !');
  }

  const isDeleted = user?.isDeleted;
  if (isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is deleted !');
  }

  const isBlocked = user?.status === 'blocked';
  if (isBlocked) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked ! !');
  }

  if (!(await User.isPasswordMatched(payload?.oldPassword, user?.password))) {
    throw new AppError(httpStatus.FORBIDDEN, `Old Password doesn't matched`);
  }

  // hashed new password
  const newHashedPassword = await generateHashedPassword(payload?.newPassword);

  // updating
  const result = await User.findOneAndUpdate(
    { id: userData.userId, role: userData.role },
    {
      password: newHashedPassword,
      needsPasswordChange: false,
      passwordChangedAt: new Date(),
    },
    { new: true },
  );

  return null;
};

const refreshToken = async (refreshToken: string) => {
  if (!refreshToken) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'Refresh token is missing !');
  }

  const decoded = verifyRefrestToken(refreshToken);

  const { userId, iat } = decoded;
  // checking if the user is exist
  const user = await User.isUserExistByCustomId(userId, false);

  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found !');
  }

  // checking if the user is already deleted
  const isDeleted = user?.isDeleted;

  if (isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is deleted !');
  }

  // checking if the user is blocked
  const userStatus = user?.status;

  if (userStatus === 'blocked') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked ! !');
  }

  if (
    user.passwordChangedAt &&
    (await User.isJwtIssuedBeforePasswordChanged(
      user.passwordChangedAt,
      iat as number,
    ))
  ) {
    throw new AppError(httpStatus.UNAUTHORIZED, 'You are not authorized !');
  }

  const jwtPayload = {
    userId: user.id,
    role: user.role,
  };

  const accessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    config.jwt_access_expires_in as string,
  );

  return {
    accessToken,
  };
};

// send a mail to the user
const forgetPassword = async (id: string) => {
  const user = await User.isUserExistByCustomId(id, false);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }

  // checking if the user is already deleted
  const isDeleted = user?.isDeleted;
  if (isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is deleted!');
  }

  // checking if the user is blocked
  const userStatus = user?.status;

  if (userStatus === 'blocked') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }

  // Create access token
  // eikhane ekebare short time er jonno just password change tai custom kom time dilam
  const jwtPayload: TJwtPayload = {
    userId: user?.id,
    role: user?.role,
  };
  const accessToken = createToken(
    jwtPayload,
    config.jwt_access_secret as string,
    '10m',
  );
  const resetUrl = `${config.reset_pass_ui_link}?id=${user?.id}&token=${accessToken}`;
  const resetEmail = resetPasswordEmail(resetUrl);
  await sendEmail(user.email, resetEmail);
};

// from the mail take the password & update the password
const resetPassword = async (payload: TResetPassword, token: string) => {
  if (!token) {
    throw new AppError(httpStatus.FORBIDDEN, 'Reset password token is missing');
  }

  const user = await User.isUserExistByCustomId(payload.id, false);
  if (!user) {
    throw new AppError(httpStatus.NOT_FOUND, 'This user is not found!');
  }
  const isDeleted = user?.isDeleted;
  if (isDeleted) {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is deleted!');
  }
  const userStatus = user?.status;
  if (userStatus === 'blocked') {
    throw new AppError(httpStatus.FORBIDDEN, 'This user is blocked!');
  }

  const decodedData = verifyAccessToken(token);

  if (decodedData.userId !== payload?.id) {
    throw new AppError(
      httpStatus.FORBIDDEN,
      'Token id & userId is not matched',
    );
  }

  const hashedPassword = await generateHashedPassword(payload?.newPassword);

  const result = await User.findOneAndUpdate(
    { id: decodedData?.userId, role: decodedData?.role },
    {
      password: hashedPassword,
      needsPasswordChange: false,
      passwordChangedAt: new Date(),
    },
    { new: true },
  );

  return null;
};

export const AuthService = {
  loginUser,
  changePassword,
  refreshToken,
  forgetPassword,
  resetPassword,
};
