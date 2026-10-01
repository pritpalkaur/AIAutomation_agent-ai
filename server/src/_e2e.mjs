// End-to-end test helper (run from server/ with tsx, which resolves ./config.js to config.ts). Usage:
//   npx tsx src/_e2e.mjs add      → puts a test email with the sample .xlsx into INBOX
//   npx tsx src/_e2e.mjs cleanup  → deletes that test email again
import fs from 'node:fs';
import { ImapFlow } from 'imapflow';
import { config } from './config.js';

const TEST_SUBJECT = 'data1 E2E-TEST products';
setTimeout(() => { console.log('timed out'); process.exit(1); }, 60_000).unref();

const { user, appPassword } = config.gmail;
const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user, pass: appPassword }, logger: false });
await client.connect();

if (process.argv[2] === 'add') {
  const xlsx = fs.readFileSync('samples/data1-sample.xlsx').toString('base64').replace(/.{76}/g, '$&\r\n');
  const boundary = 'e2e-boundary-42';
  const raw = [
    `From: ${user}`,
    `To: ${user}`,
    `Subject: ${TEST_SUBJECT}`,
    `Date: ${new Date().toUTCString()}`,
    `Message-ID: <e2e-${Date.now()}@local.test>`,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset=utf-8',
    '',
    'Automated end-to-end test. Safe to delete.',
    `--${boundary}`,
    'Content-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet; name="data1-sample.xlsx"',
    'Content-Disposition: attachment; filename="data1-sample.xlsx"',
    'Content-Transfer-Encoding: base64',
    '',
    xlsx,
    `--${boundary}--`,
    '',
  ].join('\r\n');
  const res = await client.append('INBOX', raw, []);
  console.log(`test email added (uid ${res.uid})`);
} else {
  // Gmail: removing from INBOX only archives, so move it to Trash.
  const lock = await client.getMailboxLock('[Gmail]/All Mail');
  try {
    const uids = (await client.search({ gmraw: `subject:"${TEST_SUBJECT}"` }, { uid: true })) || [];
    if (uids.length) await client.messageMove(uids, '[Gmail]/Trash', { uid: true });
    console.log(`moved ${uids.length} test email(s) to Trash`);
  } finally {
    lock.release();
  }
}
await client.logout();
process.exit(0);
