import { z } from 'zod';

const loginValidationSchema = z.object({
  body: z.object({
    id: z.string({
      required_error: 'Id is required for login',
    }),
    password: z.string({
      required_error: 'Password is required for login',
    }),
  }),
});

const changePasswordValidationSchema = z.object({
  body: z.object({
    oldPassword: z.string({
      required_error: 'Old Password is required for changing password',
    }),
    newPassword: z.string({
      required_error: 'New Password is required for changing password',
    }),
  }),
});

const refreshTokenValidationSchema = z.object({
  cookies: z.object({
    refreshToken: z.string({
      required_error: 'Refresh Token is required',
    }),
  }),
});

const forgetPasswordValidationSchema = z.object({
  body: z.object({
    id: z.string({
      required_error: 'Id is required for forget password',
      invalid_type_error: 'Id must be in string format',
    }),
  }),
});

const resetPasswordValidationSchema = z.object({
  body: z.object({
    id: z.string({
      required_error: 'Id is required for reset password',
      invalid_type_error: 'Id must be in string format',
    }),
    newPassword: z.string({
      required_error: 'A new password is required for reset password',
      invalid_type_error: 'Password must be in string format',
    }),
  }),
});

export const AuthValidation = {
  loginValidationSchema,
  changePasswordValidationSchema,
  refreshTokenValidationSchema,
  forgetPasswordValidationSchema,
  resetPasswordValidationSchema,
};
