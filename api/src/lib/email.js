import nodemailer from 'nodemailer';
import { getSetting } from './settings.js';
import { config } from '../config.js';

// Sends through whichever provider Admin → Settings → Email selects.
// smtp covers Mailpit (dev), Google Workspace and Microsoft 365 (SMTP AUTH / app passwords);
// sendgrid / postmark / resend use their HTTP APIs.
export async function sendEmail({ to, subject, text, html }, override) {
  const s = override || (await getSetting('email'));
  const from = s.from || 'no-reply@texrec.com';
  html ||= `<pre style="font-family:system-ui,sans-serif;white-space:pre-wrap">${escapeHtml(text)}</pre>`;

  switch (s.provider) {
    case 'none':
      console.log(`[email disabled] to=${to} subject=${subject}\n${text}`);
      return { skipped: true };
    case 'smtp': {
      const transport = nodemailer.createTransport({
        host: s.smtpHost, port: Number(s.smtpPort) || 587, secure: !!s.smtpSecure,
        auth: s.smtpUser ? { user: s.smtpUser, pass: s.smtpPass } : undefined,
      });
      const info = await transport.sendMail({ from, to, subject, text, html });
      return { id: info.messageId };
    }
    case 'sendgrid':
      return postJson('https://api.sendgrid.com/v3/mail/send', s.apiKey, {
        personalizations: [{ to: [{ email: to }] }], from: parseAddress(from), subject,
        content: [{ type: 'text/plain', value: text }, { type: 'text/html', value: html }],
      });
    case 'postmark':
      return postJson('https://api.postmarkapp.com/email', s.apiKey,
        { From: from, To: to, Subject: subject, TextBody: text, HtmlBody: html }, { 'X-Postmark-Server-Token': s.apiKey });
    case 'resend':
      return postJson('https://api.resend.com/emails', s.apiKey, { from, to: [to], subject, text, html });
    default:
      throw new Error(`unknown email provider ${s.provider}`);
  }
}

async function postJson(url, apiKey, body, extraHeaders = {}) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}`, ...extraHeaders },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`email provider ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return { status: res.status };
}

function parseAddress(from) {
  const m = from.match(/^(.*)<([^>]+)>$/);
  return m ? { name: m[1].trim().replace(/^"|"$/g, ''), email: m[2].trim() } : { email: from.trim() };
}

const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---- message templates ----
export const templates = {
  passwordReset: (token) => ({
    subject: 'Reset your TexRec password',
    text: `Someone asked to reset the password for your TexRec account.\n\nReset it here (link expires in 1 hour):\n${config.publicUrl}/reset?token=${token}\n\nIf this wasn't you, ignore this email.`,
  }),
  welcome: (firstName) => ({
    subject: 'Welcome to TexRec Scuba Training',
    text: `Hi ${firstName},\n\nYour TexRec student account is ready. Sign in any time to see the calendar, reserve a spot in a class, and track your certifications:\n${config.publicUrl}/login\n\nSee you in the water!\nTexRec`,
  }),
  enrollment: (firstName, ev, status) => ({
    subject: status === 'waitlisted' ? `Waitlisted: ${ev.title}` : `You're booked: ${ev.title}`,
    text: `Hi ${firstName},\n\n${status === 'waitlisted' ? 'You are on the waitlist for' : 'Your spot is reserved for'}:\n\n${ev.title}\n${fmtDate(ev.starts_at)} – ${fmtDate(ev.ends_at)}\n${ev.location || ''}\n\nManage your classes here:\n${config.publicUrl}/portal/classes\n\nTexRec`,
  }),
  cancellation: (firstName, ev) => ({
    subject: `Cancelled: ${ev.title}`,
    text: `Hi ${firstName},\n\nYour reservation for ${ev.title} on ${fmtDate(ev.starts_at)} has been cancelled.\n\nTexRec`,
  }),
  staffInvite: (firstName, tempPassword) => ({
    subject: 'Your TexRec staff account',
    text: `Hi ${firstName},\n\nA TexRec staff account has been created for you.\nSign in at ${config.publicUrl}/login with this temporary password and you'll be asked to choose a new one:\n\n${tempPassword}\n\nTexRec`,
  }),
};

const fmtDate = (d) => new Date(d).toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });
