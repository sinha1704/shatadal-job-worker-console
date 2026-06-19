import { NextResponse } from 'next/server';
import * as fs from 'fs';
import * as path from 'path';
import nodemailer from 'nodemailer';
import { getGraphicOutreachTemplate } from '../../../utils/emailTemplates';

const configFile = path.join(process.cwd(), 'data', 'email_config.json');

function loadConfig() {
  if (fs.existsSync(configFile)) {
    try {
      const content = fs.readFileSync(configFile, 'utf-8');
      return JSON.parse(content);
    } catch (e) {}
  }
  return null;
}

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const { recipients = [], subject = '', messageBody = '', smtpConfig: reqSmtpConfig } = body;

    if (!recipients || recipients.length === 0) {
      return NextResponse.json({ error: 'No recipient email addresses provided' }, { status: 400 });
    }

    if (!subject) {
      return NextResponse.json({ error: 'Email subject is required' }, { status: 400 });
    }

    if (!messageBody) {
      return NextResponse.json({ error: 'Email message body is required' }, { status: 400 });
    }

    const savedConfig = loadConfig();
    let config = reqSmtpConfig || savedConfig;

    if (!config || !config.username || !config.password) {
      return NextResponse.json({ 
        error: 'SMTP Configuration is missing or incomplete. Please configure your SMTP settings.' 
      }, { status: 400 });
    }

    // Resolve masked password if present
    if (config.password === '••••••••') {
      if (savedConfig && savedConfig.password) {
        config.password = savedConfig.password;
      } else {
        return NextResponse.json({ error: 'SMTP password credentials are incomplete.' }, { status: 400 });
      }
    }

    // Save the config to disk dynamically so changes persist automatically
    if (reqSmtpConfig) {
      const configToSave = {
        preset: config.preset,
        host: config.host,
        port: parseInt(config.port) || 465,
        secure: config.secure === undefined ? true : !!config.secure,
        username: config.username,
        password: config.password,
        senderName: config.senderName,
        senderEmail: config.senderEmail
      };

      const configDir = path.join(process.cwd(), 'data');
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }
      fs.writeFileSync(configFile, JSON.stringify(configToSave, null, 2), 'utf-8');
    }

    // Configure Nodemailer transporter
    const transporter = nodemailer.createTransport({
      host: config.host,
      port: parseInt(config.port) || 465,
      secure: !!config.secure,
      auth: {
        user: config.username,
        pass: config.password
      },
      tls: {
        rejectUnauthorized: false // Avoid handshake errors on local environments
      }
    });

    // Compile graphic HTML template
    const htmlContent = getGraphicOutreachTemplate(messageBody);

    const fromAddress = config.senderEmail 
      ? `"${config.senderName}" <${config.senderEmail}>`
      : `"${config.senderName}" <${config.username}>`;

    // Add profile picture attachment if available locally
    const attachments: any[] = [];
    const picPath = path.join(process.cwd(), 'public', 'profile-pic.jpg');
    if (fs.existsSync(picPath)) {
      attachments.push({
        filename: 'profile-pic.jpg',
        path: picPath,
        cid: 'profile-pic'
      });
    }

    const sendPromises = recipients.map(async (email: string) => {
      const cleanEmail = email.trim();
      if (!cleanEmail) return { email: '', success: false, error: 'Empty email' };
      
      try {
        await transporter.sendMail({
          from: fromAddress,
          to: cleanEmail,
          subject: subject,
          html: htmlContent,
          attachments: attachments
        });
        return { email: cleanEmail, success: true };
      } catch (err: any) {
        console.error(`Failed to send email to ${cleanEmail}:`, err.message);
        return { email: cleanEmail, success: false, error: err.message };
      }
    });

    const results = await Promise.all(sendPromises);

    const successes = results.filter((r: any) => r.success);
    const failures = results.filter((r: any) => !r.success && r.email);

    return NextResponse.json({
      success: true,
      sentCount: successes.length,
      failedCount: failures.length,
      results,
      failures
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
