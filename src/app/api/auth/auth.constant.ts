export const AUTH_COOKIE_NAME = "habitquest_session";
export const SESSION_DURATION_MS = 1000 * 60 * 60 * 24 * 7;
export const EMAIL_VERIFICATION_DURATION_MS = 1000 * 60 * 5;

export const VERIFICATION_EMAIL_SUBJECT = "Verify your HabitQuest account";

export const verificationEmailText = (name: string, verificationUrl: string) => {
  return [
    `Hi ${name},`,
    "",
    "Thanks for registering for HabitQuest.",
    "Verify your email within 5 minutes by opening this link:",
    verificationUrl,
    "",
    "If you did not create this account, you can ignore this email.",
  ].join("\n");
};

export const verificationEmailHtml = (name: string, verificationUrl: string) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
      <head>
        <meta charset="UTF-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>Verify HabitQuest Account</title>
      </head>
      <body style="margin:0;padding:24px;background:#091423;color:#d9efe2;font-family:Arial,sans-serif;">
        <div style="max-width:560px;margin:0 auto;background:#102238;border:1px solid rgba(34,197,94,0.18);border-radius:18px;padding:32px;">
          <div style="font-size:12px;letter-spacing:1px;text-transform:uppercase;color:#6b8c7a;margin-bottom:18px;">HabitQuest</div>
          <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#f3fff8;">Verify your email</h1>
          <p style="margin:0 0 14px;line-height:1.6;color:#c6ded0;">Hi ${name}, your account is almost ready. Confirm your email within 5 minutes to unlock login.</p>
          <a href="${verificationUrl}" style="display:inline-block;margin:12px 0 18px;padding:12px 22px;background:#22c55e;color:#06111c;text-decoration:none;font-weight:700;border-radius:999px;">Verify account</a>
          <p style="margin:0 0 10px;line-height:1.6;color:#8fb0a0;">If the button does not work, copy this link into your browser:</p>
          <p style="margin:0;word-break:break-all;color:#4ade80;">${verificationUrl}</p>
        </div>
      </body>
    </html>
  `;
};
