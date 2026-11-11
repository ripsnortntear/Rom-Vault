import nodemailer, { type Transporter } from "nodemailer";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.com/roms";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.zoho.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === "true" || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || "support@your-domain.com";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || `"ROM Vault Support" <${SMTP_USER}>`;

// Lazy-loaded transporter
let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: SMTP_HOST,
      port: SMTP_PORT,
      secure: SMTP_SECURE,
      auth: {
        user: SMTP_USER,
        pass: SMTP_PASS,
      },
      tls: {
        rejectUnauthorized: true,
      },
    });
  }
  return transporter;
}

/**
 * Send an email verification link to a newly registered user.
 */
export async function sendVerificationEmail(
  toEmail: string,
  username: string,
  verificationToken: string
): Promise<{ success: boolean; messageId?: string; simulated?: boolean }> {
  const verifyUrl = `${APP_URL}/auth/verify?token=${encodeURIComponent(verificationToken)}`;

  const subject = "Verify your OldsmarChaos account";

  const plainText = `Hello ${username},

Welcome to the OldsmarChaos platform! Please verify your email address.

Click the link below or copy and paste it into your browser:
${verifyUrl}

This verification link will expire in 24 hours. Once your email is verified, your account registration will be reviewed by an administrator for approval within 24 hours. You will receive an automated email as soon as a decision is made.

If you did not create an OldsmarChaos account, you can safely ignore this email.

Best regards,
The OldsmarChaos Team
${APP_URL}
`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #070709; color: #e4e4e7; margin: 0; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background-color: #121216; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5); }
    .header { background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); padding: 28px; text-align: center; }
    .logo { font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase; }
    .content { padding: 32px 28px; }
    h1 { font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 20px; }
    .button-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #dc2626; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.4); }
    .link-box { word-break: break-all; background-color: #070709; border: 1px solid rgba(255, 255, 255, 0.08); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 12px; color: #ef4444; }
    .footer { border-top: 1px solid rgba(255, 255, 255, 0.08); padding: 20px 28px; font-size: 12px; color: #71717a; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">OLDSMAR<span style="color: #fca5a5;">CHAOS</span></div>
    </div>
    <div class="content">
      <h1>Verify Email Address</h1>
      <p>Hello <strong>${escapeHtml(username)}</strong>,</p>
      <p>Welcome to <strong>OldsmarChaos</strong>! To proceed with your account registration, please verify your email address below.</p>
      <div class="button-container">
        <a href="${verifyUrl}" class="btn" target="_blank">Verify Email Address</a>
      </div>
      <p>Or paste this link into your browser:</p>
      <div class="link-box">${verifyUrl}</div>
      <p style="margin-top: 24px; font-size: 13px; color: #a1a1aa; line-height: 1.5;">
        <strong>Next Step:</strong> Once verified, your account will be reviewed by an administrator for approval (typically within 24 hours). You will receive an automated email notification once approved.
      </p>
      <p style="margin-top: 12px; font-size: 12px; color: #71717a;">This verification link is valid for 24 hours. If you did not create this account, please disregard this message.</p>
    </div>
    <div class="footer">
      OldsmarChaos &bull; Chaos in Harmony &bull; <a href="https://www.oldsmarchaos.com" style="color: #ef4444; text-decoration: none;">oldsmarchaos.com</a>
    </div>
  </div>
</body>
</html>
`;

  if (!SMTP_PASS) {
    console.warn(`[ZohoMailer] SMTP_PASS not set. Simulated verification email to ${toEmail}. Activation link: ${verifyUrl}`);
    return { success: true, simulated: true };
  }

  try {
    const info = await getTransporter().sendMail({
      from: SMTP_FROM,
      to: toEmail,
      subject,
      text: plainText,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[ZohoMailer] Failed sending verification email to ${toEmail}:`, error);
    // If SMTP fails, log link so user can still activate during setup
    console.warn(`[ZohoMailer] Fallback verification link for ${toEmail}: ${verifyUrl}`);
    throw error;
  }
}

/**
 * Send a password reset email with a cryptographic time-limited token.
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  username: string,
  resetToken: string
): Promise<{ success: boolean; messageId?: string; simulated?: boolean }> {
  const resetUrl = `${APP_URL}/auth/reset-password?token=${encodeURIComponent(resetToken)}`;

  const subject = "Reset your ROM Vault password";

  const plainText = `Hello ${username},

A password reset request was received for your ROM Vault account.

Click the link below or copy and paste it into your browser to choose a new password:
${resetUrl}

This reset link will expire in 1 hour.

If you did not request this password reset, please ignore this email. Your password will remain unchanged.

Best regards,
The ROM Vault Team
${APP_URL}
`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #070709; color: #e4e4e7; margin: 0; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background-color: #121216; border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5); }
    .header { background: linear-gradient(135deg, #b91c1c 0%, #991b1b 100%); padding: 28px; text-align: center; }
    .logo { font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase; }
    .content { padding: 32px 28px; }
    h1 { font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 20px; }
    .button-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background-color: #dc2626; color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.4); }
    .link-box { word-break: break-all; background-color: #070709; border: 1px solid rgba(255, 255, 255, 0.08); padding: 12px; border-radius: 8px; font-family: monospace; font-size: 12px; color: #ef4444; }
    .footer { border-top: 1px solid rgba(255, 255, 255, 0.08); padding: 20px 28px; font-size: 12px; color: #71717a; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">ROM <span style="color: #fca5a5;">VAULT</span></div>
    </div>
    <div class="content">
      <h1>Password Reset Request</h1>
      <p>Hello <strong>${escapeHtml(username)}</strong>,</p>
      <p>We received a request to reset your ROM Vault account password. Click the button below to set a new password:</p>
      <div class="button-container">
        <a href="${resetUrl}" class="btn" target="_blank">Reset Password</a>
      </div>
      <p>Or copy this link into your browser:</p>
      <div class="link-box">${resetUrl}</div>
      <p style="margin-top: 24px; font-size: 12px; color: #71717a;">This link is valid for <strong>1 hour</strong>. If you did not make this request, you can safely ignore this email.</p>
    </div>
    <div class="footer">
      ROM Vault &bull; Multi-Console Retro Archive &bull; <a href="${APP_URL}" style="color: #ef4444; text-decoration: none;">ROM Vault</a>
    </div>
  </div>
</body>
</html>
`;

  if (!SMTP_PASS) {
    console.warn(`[ZohoMailer] SMTP_PASS not set. Simulated password reset email to ${toEmail}. Reset link: ${resetUrl}`);
    return { success: true, simulated: true };
  }

  try {
    const info = await getTransporter().sendMail({
      from: SMTP_FROM,
      to: toEmail,
      subject,
      text: plainText,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[ZohoMailer] Failed sending password reset email to ${toEmail}:`, error);
    console.warn(`[ZohoMailer] Fallback password reset link for ${toEmail}: ${resetUrl}`);
    throw error;
  }
}

/**
 * Send an automated notification when an admin approves a pending user account.
 */
export async function sendAccountApprovedEmail(
  toEmail: string,
  username: string
): Promise<{ success: boolean; messageId?: string; simulated?: boolean }> {
  const loginUrl = `${APP_URL}/auth/login`;
  const subject = "Your OldsmarChaos Account Has Been Approved!";

  const plainText = `Hello ${username},

Great news! Your OldsmarChaos account registration has been reviewed and approved by an administrator.

You can now log in to access the ROM Vault, Minecraft server, Jellyfin media, and other platform services:
${loginUrl}

If you have any questions or encounter any issues, please reply to this email or contact support@oldsmarchaos.com.

Best regards,
OldsmarChaos Administration
`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #070709; color: #e4e4e7; margin: 0; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background-color: #121216; border: 1px solid rgba(0, 255, 157, 0.25); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6); }
    .header { background: linear-gradient(135deg, #059669 0%, #047857 100%); padding: 28px; text-align: center; }
    .logo { font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase; }
    .content { padding: 32px 28px; }
    h1 { font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 20px; }
    .button-container { text-align: center; margin: 32px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #10b981, #059669); color: #ffffff !important; text-decoration: none; font-weight: 700; font-size: 14px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 14px rgba(16, 185, 129, 0.4); }
    .badge { display: inline-block; padding: 4px 12px; background: rgba(16, 185, 129, 0.15); border: 1px solid #10b981; color: #34d399; border-radius: 999px; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 16px; }
    .footer { border-top: 1px solid rgba(255, 255, 255, 0.08); padding: 20px 28px; font-size: 12px; color: #71717a; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">OLDSMAR<span style="color: #6ee7b7;">CHAOS</span></div>
    </div>
    <div class="content">
      <div class="badge">Registration Approved</div>
      <h1>Welcome to the Vault, ${escapeHtml(username)}!</h1>
      <p>Your account request has been reviewed and <strong>approved</strong> by an administrator.</p>
      <p>Your access is now fully active across the ROM Vault, dedicated Minecraft Server, and platform tools.</p>
      <div class="button-container">
        <a href="${loginUrl}" class="btn" target="_blank">Sign In Now</a>
      </div>
      <p style="font-size: 13px; color: #71717a;">Direct link: <a href="${loginUrl}" style="color: #34d399;">${loginUrl}</a></p>
    </div>
    <div class="footer">
      OldsmarChaos &bull; Chaos in Harmony &bull; <a href="https://www.oldsmarchaos.com" style="color: #34d399; text-decoration: none;">oldsmarchaos.com</a>
    </div>
  </div>
</body>
</html>
`;

  if (!SMTP_PASS) {
    console.warn(`[ZohoMailer] SMTP_PASS not set. Simulated account approved email to ${toEmail}.`);
    return { success: true, simulated: true };
  }

  try {
    const info = await getTransporter().sendMail({
      from: SMTP_FROM,
      to: toEmail,
      subject,
      text: plainText,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[ZohoMailer] Failed sending account approval email to ${toEmail}:`, error);
    throw error;
  }
}

/**
 * Send an automated notification when an admin denies a pending user account.
 */
export async function sendAccountDeniedEmail(
  toEmail: string,
  username: string,
  reason?: string
): Promise<{ success: boolean; messageId?: string; simulated?: boolean }> {
  const subject = "OldsmarChaos Account Registration Update";

  const plainText = `Hello ${username},

Thank you for your interest in OldsmarChaos.

Your account registration request was reviewed by an administrator and was not approved at this time.
${reason ? `Reason: ${reason}\n` : ""}
If you believe this decision was made in error or have additional questions, please reach out to our team at support@oldsmarchaos.com.

Best regards,
OldsmarChaos Administration
`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #070709; color: #e4e4e7; margin: 0; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background-color: #121216; border: 1px solid rgba(239, 68, 68, 0.25); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6); }
    .header { background: linear-gradient(135deg, #7f1d1d 0%, #991b1b 100%); padding: 28px; text-align: center; }
    .logo { font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase; }
    .content { padding: 32px 28px; }
    h1 { font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 16px; }
    p { font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 20px; }
    .reason-box { background: rgba(239, 68, 68, 0.1); border-left: 3px solid #ef4444; padding: 12px 16px; margin: 20px 0; border-radius: 4px; color: #fca5a5; font-size: 13px; }
    .footer { border-top: 1px solid rgba(255, 255, 255, 0.08); padding: 20px 28px; font-size: 12px; color: #71717a; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">OLDSMAR<span style="color: #fca5a5;">CHAOS</span></div>
    </div>
    <div class="content">
      <h1>Account Registration Status</h1>
      <p>Hello <strong>${escapeHtml(username)}</strong>,</p>
      <p>Your request to register an account on the OldsmarChaos platform was reviewed by an administrator and was not approved at this time.</p>
      ${reason ? `<div class="reason-box"><strong>Administrator Note:</strong> ${escapeHtml(reason)}</div>` : ""}
      <p>If you believe this decision was made in error or wish to appeal, please contact us at <a href="mailto:support@oldsmarchaos.com" style="color: #ef4444;">support@oldsmarchaos.com</a>.</p>
    </div>
    <div class="footer">
      OldsmarChaos Administration &bull; <a href="https://www.oldsmarchaos.com" style="color: #ef4444; text-decoration: none;">oldsmarchaos.com</a>
    </div>
  </div>
</body>
</html>
`;

  if (!SMTP_PASS) {
    console.warn(`[ZohoMailer] SMTP_PASS not set. Simulated account denied email to ${toEmail}.`);
    return { success: true, simulated: true };
  }

  try {
    const info = await getTransporter().sendMail({
      from: SMTP_FROM,
      to: toEmail,
      subject,
      text: plainText,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[ZohoMailer] Failed sending account denied email to ${toEmail}:`, error);
    throw error;
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
