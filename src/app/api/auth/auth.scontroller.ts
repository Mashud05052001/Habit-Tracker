/* eslint-disable @typescript-eslint/no-unused-vars */
import httpStatus from 'http-status';
import catchAsync from '../../utils/catchAsync';
import sendResponse from '../../utils/sendResponse';
import { AuthService }  from './auth.service';
import config from '../../config';

const loginUser = catchAsync(async (req, res) => {
  const data = req?.body;
  const result = await AuthService.loginUser(data);
  const { refreshToken, ...otherData } = result;
  // console.log(refreshToken, result.accessToken);
  res.cookie('refreshToken', refreshToken, {
    secure: config.node_env === 'production',
    httpOnly: true,
    sameSite: true,
    maxAge: 1000 * 60 * 60 * 24 * 90, // 3 months the refresh token will valid
  });
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Login successfully',
    data: otherData,
  });
});

const changePassword = catchAsync(async (req, res) => {
  const user = req?.user;
  const passwordData = req?.body;
  const result = await AuthService.changePassword(user, passwordData);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Pasword has been changed successfully',
    data: result,
  });
});

const refreshToken = catchAsync(async (req, res) => {
  const { refreshToken } = req.cookies;
  const result = await AuthService.refreshToken(refreshToken);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Access token is retrieved succesfully!',
    data: result,
  });
});

const forgetPassword = catchAsync(async (req, res) => {
  const { id } = req.body;
  const result = await AuthService.forgetPassword(id);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Reset link is generated successfully!',
    data: result,
  });
});

const resetPassword = catchAsync(async (req, res, next) => {
  const token = req?.headers?.authorization as string;
  const result = await AuthService.resetPassword(req.body, token);
  sendResponse(res, {
    statusCode: httpStatus.OK,
    success: true,
    message: 'Password updated successfully',
    data: result,
  });
});

export const AuthController = {
  loginUser,
  changePassword,
  refreshToken,
  forgetPassword,
  resetPassword,
};
