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
  const rawPass = process.env.SMTP_PASS;
  const pass =
    host === "smtp.gmail.com" ? rawPass?.replace(/\s+/g, "") : rawPass;

  if (!host || !user || !pass) {
    console.warn(
      "SMTP credentials are not configured. Verification email delivery was skipped.",
    );
    return { delivered: false };
  }

  const port = Number(process.env.SMTP_PORT || 587);
  const secure = process.env.SMTP_SECURE === "true" || port === 465;

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    requireTLS: true,
    ...(secure === false && {
      tls: {
        rejectUnauthorized: false,
      },
    }),
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
      error instanceof Error ? error.message : "Failed to send email",
    );
  }
};

export default sendEmail;
