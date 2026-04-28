import nodemailer from "nodemailer";
import { AuthError } from "../auth/auth.utils";

type TSendEmailArgs = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

type TSendEmailResult = {
  delivered: boolean;
  previewUrl?: string;
};

const sendEmail = async ({
  to,
  subject,
  text,
  html,
}: TSendEmailArgs): Promise<TSendEmailResult> => {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn("SMTP credentials are not configured. Verification email delivery was skipped.");
    return { delivered: false };
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT || 587),
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user,
      pass,
    },
  });

  try {
    const info = await transporter.sendMail({
      from: process.env.EMAIL_FROM || user,
      to,
      subject,
      text,
      html,
    });

    return {
      delivered: true,
      previewUrl: nodemailer.getTestMessageUrl(info) || undefined,
    };
  } catch (error) {
    throw new AuthError(
      500,
      error instanceof Error ? error.message : "Failed to send email"
    );
  }
};

export default sendEmail;
