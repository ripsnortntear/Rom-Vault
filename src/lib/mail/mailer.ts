import nodemailer, { type Transporter } from "nodemailer";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://your-domain.example.com/roms";
const SMTP_HOST = process.env.SMTP_HOST || "smtp.zoho.com";
const SMTP_PORT = Number(process.env.SMTP_PORT) || 587;
const SMTP_SECURE = process.env.SMTP_SECURE === "true" || SMTP_PORT === 465;
const SMTP_USER = process.env.SMTP_USER || "support@example.com";
const SMTP_PASS = process.env.SMTP_PASS || "";
const SMTP_FROM = process.env.SMTP_FROM || `"Support" <${SMTP_USER}>`;

export const ADMIN_NOTIFICATION_EMAILS: string[] = (
  process.env.ADMIN_NOTIFICATION_EMAILS ||
  "admin@example.com,support@example.com"
)
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

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
      OldsmarChaos &bull; Chaos in Harmony &bull; <a href="${new URL(APP_URL).origin}" style="color: #ef4444; text-decoration: none;">${new URL(APP_URL).hostname}</a>
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

If you have any questions or encounter any issues, please reply to this email or contact ${SMTP_USER}.

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
      OldsmarChaos &bull; Chaos in Harmony &bull; <a href="${new URL(APP_URL).origin}" style="color: #34d399; text-decoration: none;">${new URL(APP_URL).hostname}</a>
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
If you believe this decision was made in error or have additional questions, please reach out to our team at ${SMTP_USER}.

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
      <p>If you believe this decision was made in error or wish to appeal, please contact us at <a href="mailto:${SMTP_USER}" style="color: #ef4444;">${SMTP_USER}</a>.</p>
    </div>
    <div class="footer">
      OldsmarChaos Administration &bull; <a href="${new URL(APP_URL).origin}" style="color: #ef4444; text-decoration: none;">${new URL(APP_URL).hostname}</a>
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

/**
 * Send an alert to administrators when a new user registers and requires review/approval.
 * Dispatches to configured administrator email addresses.
 * Strictly avoids putting the administrator's name anywhere in the email.
 */
export async function sendAdminRegistrationNotificationEmail(newUser: {
  username: string;
  email: string;
  registeredAt?: Date | string;
  ipAddress?: string;
  status?: string;
  isEmailVerified?: boolean;
}): Promise<{ success: boolean; messageId?: string; simulated?: boolean }> {
  const approvalUrl = `${APP_URL}/admin/users`;
  const statusText = newUser.status || (newUser.isEmailVerified ? "Email Confirmed - Ready for Approval" : "Pending Administrator Approval");
  const subject = newUser.isEmailVerified
    ? `[OldsmarChaos] Account Email Verified - Ready for Approval: ${newUser.username}`
    : `[OldsmarChaos] New Account Registration - Approval Required: ${newUser.username}`;

  const regDate = newUser.registeredAt
    ? new Date(newUser.registeredAt).toLocaleString("en-US", {
        timeZone: "America/New_York",
        dateStyle: "full",
        timeStyle: "medium",
      }) + " EST"
    : new Date().toLocaleString("en-US", { timeZone: "America/New_York" }) + " EST";

  const plainText = `Hello,

A new user account has registered on the OldsmarChaos platform and requires administrator review.

Account Details:
- Username: ${newUser.username}
- Email Address: ${newUser.email}
- Registered At: ${regDate}
- IP Address: ${newUser.ipAddress || "Unknown"}
- Status: ${statusText}

To review, approve, or deny this account, visit the OldsmarChaos User Management dashboard:
${approvalUrl}

Best regards,
OldsmarChaos Automated Administration
${new URL(APP_URL).origin}
`;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <title>${escapeHtml(subject)}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #070709; color: #e4e4e7; margin: 0; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background-color: #121216; border: 1px solid rgba(0, 240, 255, 0.25); border-radius: 16px; overflow: hidden; box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6); }
    .header { background: linear-gradient(135deg, #090e1a 0%, #0369a1 50%, #00f0ff 100%); padding: 28px; text-align: center; }
    .logo { font-size: 24px; font-weight: 900; letter-spacing: -0.5px; color: #ffffff; text-transform: uppercase; }
    .content { padding: 32px 28px; }
    h1 { font-size: 20px; font-weight: 700; color: #ffffff; margin-top: 0; margin-bottom: 8px; }
    .badge { display: inline-block; background: rgba(0, 240, 255, 0.15); color: #00f0ff; border: 1px solid rgba(0, 240, 255, 0.35); font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 9999px; text-transform: uppercase; margin-bottom: 20px; }
    p { font-size: 14px; line-height: 1.6; color: #a1a1aa; margin-bottom: 20px; }
    .info-card { background: #090a0f; border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 12px; padding: 18px; margin: 20px 0; }
    .info-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid rgba(255, 255, 255, 0.05); font-size: 13px; }
    .info-row:last-child { border-bottom: none; padding-bottom: 0; }
    .info-label { color: #71717a; font-weight: 500; }
    .info-val { color: #f4f4f5; font-weight: 600; }
    .button-container { text-align: center; margin: 30px 0 20px 0; }
    .btn { display: inline-block; background: linear-gradient(135deg, #00f0ff 0%, #0284c7 100%); color: #070913 !important; text-decoration: none; font-weight: 800; font-size: 14px; padding: 14px 32px; border-radius: 12px; box-shadow: 0 4px 20px rgba(0, 240, 255, 0.35); }
    .link-box { word-break: break-all; background-color: #070709; border: 1px solid rgba(255, 255, 255, 0.08); padding: 10px; border-radius: 8px; font-family: monospace; font-size: 11px; color: #00f0ff; text-align: center; }
    .footer { border-top: 1px solid rgba(255, 255, 255, 0.08); padding: 20px 28px; font-size: 12px; color: #71717a; text-align: center; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="logo">OLDSMAR<span style="color: #070913;">CHAOS</span></div>
    </div>
    <div class="content">
      <div class="badge">Approval Required</div>
      <h1>New User Registration</h1>
      <p>A new user account has registered on the OldsmarChaos platform and requires administrator approval.</p>
      
      <div class="info-card">
        <div class="info-row">
          <span class="info-label">Username:</span>
          <span class="info-val" style="color: #00f0ff;">${escapeHtml(newUser.username)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Email Address:</span>
          <span class="info-val">${escapeHtml(newUser.email)}</span>
        </div>
        <div class="info-row">
          <span class="info-label">Registered At:</span>
          <span class="info-val">${escapeHtml(regDate)}</span>
        </div>
        ${newUser.ipAddress ? `
        <div class="info-row">
          <span class="info-label">IP Address:</span>
          <span class="info-val" style="font-family: monospace;">${escapeHtml(newUser.ipAddress)}</span>
        </div>` : ""}
        <div class="info-row">
          <span class="info-label">Account Status:</span>
          <span class="info-val" style="color: #fbbf24;">${escapeHtml(statusText)}</span>
        </div>
      </div>

      <div class="button-container">
        <a href="${approvalUrl}" class="btn" target="_blank">Review &amp; Approve Account</a>
      </div>
      <p style="font-size: 12px; color: #71717a; text-align: center; margin-bottom: 6px;">Direct Dashboard Link:</p>
      <div class="link-box">${approvalUrl}</div>
    </div>
    <div class="footer">
      OldsmarChaos Automated Administration &bull; <a href="${new URL(APP_URL).origin}" style="color: #00f0ff; text-decoration: none;">${new URL(APP_URL).hostname}</a>
    </div>
  </div>
</body>
</html>
`;

  if (!SMTP_PASS) {
    console.warn(`[ZohoMailer] SMTP_PASS not set. Simulated admin notification email for ${newUser.username} to ${ADMIN_NOTIFICATION_EMAILS.join(", ")}.`);
    return { success: true, simulated: true };
  }

  try {
    const info = await getTransporter().sendMail({
      from: SMTP_FROM,
      to: ADMIN_NOTIFICATION_EMAILS,
      subject,
      text: plainText,
      html,
    });
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`[ZohoMailer] Failed sending admin registration notification email to ${ADMIN_NOTIFICATION_EMAILS.join(", ")}:`, error);
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
