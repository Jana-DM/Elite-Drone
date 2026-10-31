const nodemailer = require('nodemailer');
require('dotenv').config();

let transporter = null;

if (process.env.SMTP_USER && process.env.SMTP_PASS) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  transporter.verify((error) => {
    if (error) {
      console.warn('⚠️ SMTP Transporter verification notice:', error.message);
    } else {
      console.log('📧 SMTP Transporter verified and ready to send emails.');
    }
  });
} else {
  console.log('ℹ️ Nodemailer: No Gmail SMTP credentials in .env. Falling back to Console Logger & PostgreSQL OTP storage for development.');
}

async function sendEmailOtp({ to, otpCode, purpose = 'Verification' }) {
  const mailOptions = {
    from: `"${process.env.FROM_NAME || 'Elite Drone Service'}" <${process.env.FROM_EMAIL || 'no-reply@elitedroneservice.com'}>`,
    to,
    subject: `Your ${purpose} Code: ${otpCode} - Elite Drone Service`,
    html: `
      <div style="font-family: 'Helvetica Neue', Arial, sans-serif; background-color: #0b0f19; color: #f8fafc; padding: 2.5rem; border-radius: 12px; max-width: 580px; margin: auto; border: 1px solid rgba(14, 165, 233, 0.3);">
        <div style="text-align: center; margin-bottom: 2rem;">
          <h1 style="color: #38bdf8; font-size: 26px; letter-spacing: 2px; margin: 0;">ELITE DRONE SERVICE</h1>
          <p style="color: #94a3b8; font-size: 13px; text-transform: uppercase; letter-spacing: 1.5px; margin-top: 4px;">Commercial Aerial Cinematography</p>
        </div>
        <div style="background-color: rgba(17, 26, 46, 0.85); border-radius: 8px; padding: 2rem; border: 1px solid rgba(255, 255, 255, 0.08); text-align: center;">
          <h2 style="color: #ffffff; font-size: 18px; margin-top: 0;">${purpose} Code</h2>
          <p style="color: #cbd5e1; font-size: 14px; line-height: 1.6;">
            Please use the following One-Time Password (OTP) to complete your request. This code is valid for <strong>10 minutes</strong>.
          </p>
          <div style="margin: 2rem 0;">
            <span style="font-size: 38px; font-weight: 800; letter-spacing: 8px; color: #38bdf8; background: #070a12; padding: 12px 28px; border-radius: 8px; border: 1px dashed #0ea5e9; display: inline-block;">
              ${otpCode}
            </span>
          </div>
          <p style="color: #94a3b8; font-size: 12px; margin: 0;">
            If you did not initiate this request, please disregard this email or contact security at missions@elitedrone.com.
          </p>
        </div>
        <div style="text-align: center; margin-top: 2rem; font-size: 11px; color: #64748b;">
          © 2026 Elite Drone Service. Directorate General of Civil Aviation (DGCA) Compliant Operations.
        </div>
      </div>
    `,
  };

  if (transporter) {
    try {
      await transporter.sendMail(mailOptions);
      console.log(`✉️ Email OTP successfully dispatched via SMTP to ${to}`);
      return { success: true, method: 'smtp' };
    } catch (err) {
      console.error(`❌ SMTP delivery failed to ${to}:`, err.message);
      // Fallback
    }
  }

  // Console output for development / local testing
  console.log('====================================================');
  console.log(`📬 [DEV EMAIL OTP DISPATCH]`);
  console.log(`🎯 Recipient: ${to}`);
  console.log(`🔑 OTP Code:  >>> ${otpCode} <<<`);
  console.log(`⏱️ Expiry:    10 minutes`);
  console.log('====================================================');

  return { success: true, method: 'console_fallback' };
}

async function sendSmsOtp({ mobile, otpCode, purpose = 'Verification' }) {
  // Mobile OTP integration notice:
  // For production SMS delivery, configure Twilio, MSG91, or Fast2SMS in .env:
  // TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_PHONE_NUMBER
  console.log('====================================================');
  console.log(`📱 [MOBILE OTP DISPATCH]`);
  console.log(`🎯 Mobile:    +91 ${mobile}`);
  console.log(`🔑 OTP Code:  >>> ${otpCode} <<<`);
  console.log(`ℹ️ Provider:  ${process.env.SMS_PROVIDER || 'console_fallback'}`);
  console.log(`📝 Notice:    To enable live SMS delivery, connect an external SMS gateway (Twilio / MSG91) in .env`);
  console.log('====================================================');

  return { 
    success: true, 
    method: 'console_fallback', 
    note: 'Mobile OTP logged to system console. For live cellular carrier delivery, connect Twilio/MSG91 in .env.' 
  };
}

module.exports = {
  transporter,
  sendEmailOtp,
  sendSmsOtp,
};
