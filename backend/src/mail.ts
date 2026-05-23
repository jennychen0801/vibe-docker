import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'localhost',
  port: parseInt(process.env.SMTP_PORT || '1025'),
  secure: false, // Maildev doesn't use SSL/TLS
});

export const sendPasswordEmail = async (email: string, name: string, password: string) => {
  const mailOptions = {
    from: '"Attendance System" <system@attendance.com>',
    to: email,
    subject: '您的登入密碼',
    html: `
      <h2>您好, ${name}</h2>
      <p>您的出缺勤管理系統帳號已成功建立。</p>
      <p>以下是您的登入資訊：</p>
      <ul>
        <li>電子信箱：${email}</li>
        <li>初始密碼：<strong>${password}</strong></li>
      </ul>
      <p>請於首次登入後儘速修改您的密碼。</p>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Password email sent successfully to ${email}`);
  } catch (error) {
    console.error(`Failed to send password email to ${email}:`, error);
  }
};

export const sendNotificationEmail = async (email: string, subject: string, message: string) => {
  const mailOptions = {
    from: '"Attendance System" <system@attendance.com>',
    to: email,
    subject: subject,
    html: `<p>${message}</p>`,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Notification email sent to ${email}`);
  } catch (error) {
    console.error(`Failed to send notification email to ${email}:`, error);
  }
};
