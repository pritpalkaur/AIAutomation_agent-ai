import path from 'node:path';
import { ImapFlow } from 'imapflow';
import { extractRecordsFromText } from './aiExtractor.js';
import { config, gmailConfigured } from './config.js';
import { parseAttachment, SUPPORTED_EXTENSIONS } from './parseAttachment.js';
import { insertMany, validateRecord } from './painRecords.js';

let running = false;

/**
 * Finds Gmail messages whose subject contains the keyword and are not yet labelled as processed.
 * Imports every .xlsx/.json attachment into PainRecords. When AI extraction is on, emails without
 * such an attachment are read by Claude from the email text instead. Finally adds the processed
 * label so the same email is never imported twice.
 */
export async function processInbox() {
  if (!gmailConfigured) throw new Error('Set GMAIL_USER and GMAIL_APP_PASSWORD in server/.env');
  if (running) return { skipped: true, reason: 'An email check is already running' };
  running = true;

  const { user, appPassword, mailbox, subjectKeyword, processedLabel } = config.gmail;
  const summary = {
    emails: 0,
    attachments: 0,
    aiEmails: 0,
    inserted: 0,
    rejectedRows: [],
    failedEmails: [],
  };
  const client = new ImapFlow({
    host: 'imap.gmail.com',
    port: 993,
    secure: true,
    auth: { user, pass: appPassword },
    logger: false,
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(mailbox);
    try {
      // gmraw uses Gmail's own search syntax, same as the Gmail search box.
      // Without AI, only emails with attachments can be imported.
      const attachmentFilter = config.ai.enabled ? '' : ' has:attachment';
      const query = `subject:${subjectKeyword}${attachmentFilter} -label:${processedLabel}`;
      const uids = (await client.search({ gmraw: query }, { uid: true })) || [];

      for (const uid of uids) {
        try {
          await processMessage(client, uid, summary);
        } catch (err) {
          // Not labelled, so it will be retried on the next run.
          summary.failedEmails.push({ uid, error: err.message });
        }
      }
    } finally {
      lock.release();
    }
  } finally {
    running = false;
    await client.logout().catch(() => {});
  }
  return summary;
}

async function processMessage(client, uid, summary) {
  const message = await client.fetchOne(uid, { envelope: true, bodyStructure: true }, { uid: true });
  const subject = message.envelope?.subject ?? '';
  const records = [];

  // Every source (Excel, JSON or AI) goes through the same validation before saving.
  const collect = (rows, source) =>
    rows.forEach((row, index) => {
      const { record, errors } = validateRecord(row);
      if (errors.length) {
        summary.rejectedRows.push({ subject, file: source, row: index + 1, errors });
      } else {
        records.push(record);
      }
    });

  const attachments = findAttachments(message.bodyStructure);
  for (const attachment of attachments) {
    const { content } = await client.download(uid, attachment.part, { uid: true });
    collect(await parseAttachment(attachment.filename, await toBuffer(content)), attachment.filename);
    summary.attachments++;
  }

  if (!attachments.length && config.ai.enabled) {
    const text = await downloadBodyText(client, uid, message.bodyStructure);
    if (text.trim()) {
      const { records: aiRows } = await extractRecordsFromText(text, {
        subject,
        sentAt: message.envelope?.date ?? new Date(),
      });
      collect(aiRows, 'email text (AI)');
      summary.aiEmails++;
    }
  }

  summary.inserted += await insertMany(records);
  await client.messageFlagsAdd(uid, [config.gmail.processedLabel], { uid: true, useLabels: true });
  summary.emails++;
}

function findAttachments(node, found = []) {
  if (!node) return found;
  const filename = node.dispositionParameters?.filename || node.parameters?.name;
  if (filename && node.part && SUPPORTED_EXTENSIONS.includes(path.extname(filename).toLowerCase())) {
    found.push({ part: node.part, filename });
  }
  for (const child of node.childNodes ?? []) findAttachments(child, found);
  return found;
}

// Prefers the text/plain part; falls back to text/html with the tags stripped.
async function downloadBodyText(client, uid, bodyStructure) {
  const parts = { plain: null, html: null };
  (function walk(node) {
    if (!node) return;
    const isAttachment = node.disposition === 'attachment';
    if (!isAttachment && node.type === 'text/plain') parts.plain ??= node.part ?? '1';
    if (!isAttachment && node.type === 'text/html') parts.html ??= node.part ?? '1';
    for (const child of node.childNodes ?? []) walk(child);
  })(bodyStructure);

  const part = parts.plain ?? parts.html;
  if (!part) return '';
  const { content } = await client.download(uid, part, { uid: true });
  const text = (await toBuffer(content)).toString('utf8');
  if (parts.plain) return text;
  return text
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

async function toBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
