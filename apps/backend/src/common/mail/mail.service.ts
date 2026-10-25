import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

export interface SendMailOptions {
  to: string;
  subject: string;
  text?: string;
  html: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private transporter: nodemailer.Transporter | null = null;

  constructor(private readonly configService: ConfigService) {
    const host = this.configService.get<string>('app.mail.host');
    const user = this.configService.get<string>('app.mail.user');
    const pass = this.configService.get<string>('app.mail.password');

    if (user && pass) {
      this.transporter = nodemailer.createTransport({
        host,
        port: this.configService.get<number>('app.mail.port', 587),
        secure: this.configService.get<boolean>('app.mail.secure', false),
        auth: { user, pass },
      });
    } else {
      this.logger.warn('Mail transporter unconfigured; emails will be logged to console.');
    }
  }

  async sendMail(options: SendMailOptions): Promise<boolean> {
    const fromName = this.configService.get<string>('app.mail.fromName', 'ZenHR');
    const fromAddress = this.configService.get<string>('app.mail.fromAddress', 'noreply@zenhr.com');
    const from = `"${fromName}" <${fromAddress}>`;

    if (!this.transporter) {
      this.logger.log(`[DEV MAIL] To: ${options.to} | Subject: ${options.subject}`);
      return true;
    }

    try {
      await this.transporter.sendMail({
        from,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html,
      });
      return true;
    } catch (error) {
      this.logger.error(`Failed to send email to ${options.to}`, error);
      return false;
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<boolean> {
    const frontendUrl = this.configService.get<string>('app.frontendUrl', 'http://localhost:3000');
    const verifyUrl = `${frontendUrl}/verify-email?token=${token}`;
    return this.sendMail({
      to,
      subject: 'Verify your ZenHR account',
      html: `
        <h2>Welcome to ZenHR</h2>
        <p>Please click the link below to verify your email address:</p>
        <p><a href="${verifyUrl}" target="_blank">Verify Email</a></p>
        <p>This link will expire in 24 hours.</p>
      `,
    });
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<boolean> {
    const frontendUrl = this.configService.get<string>('app.frontendUrl', 'http://localhost:3000');
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;
    return this.sendMail({
      to,
      subject: 'Reset your ZenHR password',
      html: `
        <h2>ZenHR Password Reset</h2>
        <p>You requested a password reset. Click the link below to set a new password:</p>
        <p><a href="${resetUrl}" target="_blank">Reset Password</a></p>
        <p>This link will expire in 1 hour. If you did not request this, please ignore this email.</p>
      `,
    });
  }

  async sendBreakAlertEmail(
    recipients: string[],
    employeeName: string,
    breakStartTime: Date,
    allowedDurationMinutes: number,
  ): Promise<boolean> {
    const formattedTime = breakStartTime.toLocaleTimeString();
    return this.sendMail({
      to: recipients.join(','),
      subject: `[ZenHR Alert] ${employeeName} has started a break`,
      html: `
        <h3>Employee Break Alert</h3>
        <p><strong>${employeeName}</strong> paused work timer for a break at <strong>${formattedTime}</strong>.</p>
        <p>Configured allowed break duration: <strong>${allowedDurationMinutes} minutes</strong>.</p>
      `,
    });
  }
}
