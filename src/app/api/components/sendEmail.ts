import nodemailer from 'nodemailer';
import config from '../config';
import AppError from '../errors/AppError';
import httpStatus from 'http-status';

const sendEmail = async (to: string, html: string) => {
  const transporter = nodemailer.createTransport({
    host: 'smtp.gmail.com',
    port: 587,
    secure: config.node_env === 'production',
    auth: {
      user: config.nodemailer_auth_email,
      pass: config.nodemailer_auth_password,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: `PH University <${config.nodemailer_auth_email}>`,
      to,
      subject: 'PH-University Password Change',
      text: 'Reset your password withen 10 minutes',
      replyTo: 'support@phuniversity.com',
      html,
    });

    console.log('Message sent: %s', info.messageId);
  } catch (err) {
    throw new AppError(
      httpStatus.INTERNAL_SERVER_ERROR,
      (err as Error)?.message,
    );
  }
};

export default sendEmail;
