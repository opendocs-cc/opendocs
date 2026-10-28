import { sendEmail, signInCodeEmail } from "../email";

/**
 * Options for Better Auth's `emailOTP` plugin, shared by the web and API
 * auth instances so a code requested in one can be verified by the other
 * (both read the same `verification` table).
 *
 * Codes are stored hashed, expire after 10 minutes and allow 5 attempts.
 * A sign-in code for an unknown email creates the account on verify, which
 * is what makes one-step agent signup work; `SIGNUPS_DISABLED=true` turns
 * that off so only existing accounts can sign in.
 */
export const EMAIL_CODE_EXPIRES_IN_SECONDS = 600;

export const emailCodeOptions = {
  otpLength: 6,
  expiresIn: EMAIL_CODE_EXPIRES_IN_SECONDS,
  allowedAttempts: 5,
  storeOTP: "hashed" as const,
  disableSignUp: process.env.SIGNUPS_DISABLED === "true",
  async sendVerificationOTP({ email, otp }: { email: string; otp: string; type: string }) {
    await sendEmail({
      to: email,
      subject: `${otp} is your OpenDocs sign-in code`,
      html: signInCodeEmail(otp),
    });
  },
};
