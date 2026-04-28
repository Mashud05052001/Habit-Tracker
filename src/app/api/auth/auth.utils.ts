import jwt, { JwtPayload } from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { TJwtPayload } from './auth.interface';
import config from '../../config';

export const createToken = (
  payload: TJwtPayload,
  secretCode: string,
  expiresIn: string,
) => {
  return jwt.sign(payload, secretCode, { expiresIn });
};

export const verifyAccessToken = (token: string) => {
  return jwt.verify(token, config.jwt_access_secret as string) as JwtPayload;
};
export const verifyRefrestToken = (token: string) => {
  return jwt.verify(token, config.jwt_refresh_secret as string) as JwtPayload;
};

export const generateHashedPassword = async (password: string) => {
  return await bcrypt.hash(password, Number(config.bcrypt_salt_rounds));
};

export const isHashPasswordMatched = async (
  password: string,
  hashedPassword: string,
) => {
  return await bcrypt.compare(password, hashedPassword);
};
