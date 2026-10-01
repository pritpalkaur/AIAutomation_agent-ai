import path from 'node:path';
import { ImapFlow, type MessageStructureObject } from 'imapflow';
import { extractProductsFromText } from './aiExtractor.js';
import { config, gmailConfigured } from './config.js';
import { parseAttachment, SUPPORTED_EXTENSIONS } from './parseAttachment.js';
import { insertMany, validateProduct, type Product } from './products.js';

export interface InboxSummary {
  emails: number;
  attachments: number;
  aiEmails: number;
  inserted: number;
  rejectedRows: { subject: string; file: string; row: number; errors: string[] }[];
  failedEmails: { uid: number; error: string }[];
}

export type InboxResult = InboxSummary | { skipped: true; reason: string };

let running = false;

/**
 * Finds Gmail messages whose subject contains the keyword and are not yet labelled as processed.
 * Imports every .xlsx/.json attachment into dbo.Products. When AI extraction is on, emails without
 * such an attachment are read by Claude from the email text instead. Finally adds the processed
 * label so the same email is never imported twice.
 */
export async function processInbox(): Promise<InboxResult> {
  if (!gmailConfigured) throw new Error('Set GMAIL_USER and GMAIL_APP_PASSWORD in server/.env');
  if (running) return { skipped: true, reason: 'An email check is already running' };
  running = true;

  const { user, appPassword, mailbox, subjectKeyword, processedLabel } = config.gmail;
  const summary: InboxSummary = {
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
    auth: { user: user ?? '', pass: appPassword },
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
          summary.failedEmails.push({ uid, error: (err as Error).message });
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

async function processMessage(client: ImapFlow, uid: number, summary: InboxSummary): Promise<void> {
  const message = await client.fetchOne(String(uid), { envelope: true, bodyStructure: true }, { uid: true });
  if (!message) throw new Error('Email not found');
  const subject = message.envelope?.subject ?? '';
  const products: Product[] = [];

  // Every source (Excel, JSON or AI) goes through the same validation before saving.
  const collect = (rows: unknown[], source: string) =>
    rows.forEach((row, index) => {
      const { product, errors } = validateProduct(row);
      if (errors.length) {
        summary.rejectedRows.push({ subject, file: source, row: index + 1, errors });
      } else {
        products.push(product);
      }
    });

  const attachments = findAttachments(message.bodyStructure);
  for (const attachment of attachments) {
    const { content } = await client.download(String(uid), attachment.part, { uid: true });
    collect(await parseAttachment(attachment.filename, await toBuffer(content)), attachment.filename);
    summary.attachments++;
  }

  if (!attachments.length && config.ai.enabled) {
    const text = await downloadBodyText(client, uid, message.bodyStructure);
    if (text.trim()) {
      const { products: aiRows } = await extractProductsFromText(text, { subject });
      collect(aiRows, 'email text (AI)');
      summary.aiEmails++;
    }
  }

  summary.inserted += await insertMany(products);
  await client.messageFlagsAdd(String(uid), [config.gmail.processedLabel], { uid: true, useLabels: true });
  summary.emails++;
}

interface Attachment {
  part: string;
  filename: string;
}

function findAttachments(node: MessageStructureObject | undefined, found: Attachment[] = []): Attachment[] {
  if (!node) return found;
  const filename = node.dispositionParameters?.filename || node.parameters?.name;
  if (filename && node.part && SUPPORTED_EXTENSIONS.includes(path.extname(filename).toLowerCase())) {
    found.push({ part: node.part, filename });
  }
  for (const child of node.childNodes ?? []) findAttachments(child, found);
  return found;
}

// Prefers the text/plain part; falls back to text/html with the tags stripped.
async function downloadBodyText(
  client: ImapFlow,
  uid: number,
  bodyStructure: MessageStructureObject | undefined,
): Promise<string> {
  const parts: { plain: string | null; html: string | null } = { plain: null, html: null };
  (function walk(node: MessageStructureObject | undefined) {
    if (!node) return;
    const isAttachment = node.disposition === 'attachment';
    if (!isAttachment && node.type === 'text/plain') parts.plain ??= node.part ?? '1';
    if (!isAttachment && node.type === 'text/html') parts.html ??= node.part ?? '1';
    for (const child of node.childNodes ?? []) walk(child);
  })(bodyStructure);

  const part = parts.plain ?? parts.html;
  if (!part) return '';
  const { content } = await client.download(String(uid), part, { uid: true });
  const text = (await toBuffer(content)).toString('utf8');
  if (parts.plain) return text;
  return text
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, '')
    .replace(/<br\s*\/?>|<\/p>|<\/div>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
}

async function toBuffer(stream: AsyncIterable<Buffer> | undefined): Promise<Buffer> {
  if (!stream) throw new Error('Email part could not be downloaded');
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}
