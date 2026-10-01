// Tests the Gmail login and lists emails waiting to be imported. Does not import anything.
// Usage: npm run check-gmail
import { ImapFlow } from 'imapflow';
import { config } from './config.js';

const { user, appPassword, mailbox, subjectKeyword, processedLabel } = config.gmail;
const pw = appPassword ?? '';
console.log(`user: ${user}`);
console.log(`app password: ${pw.length} chars, looks like an App Password: ${/^[a-z]{16}$/.test(pw)}`);

setTimeout(() => {
  console.log('timed out');
  process.exit(1);
}, 45_000).unref();

const client = new ImapFlow({ host: 'imap.gmail.com', port: 993, secure: true, auth: { user: user ?? '', pass: pw }, logger: false });
try {
  await client.connect();
  console.log('login: OK');
  const lock = await client.getMailboxLock(mailbox);
  try {
    const query = `subject:${subjectKeyword} has:attachment -label:${processedLabel}`;
    const uids = (await client.search({ gmraw: query }, { uid: true })) || [];
    console.log(`emails waiting to import: ${uids.length}`);
    for (const uid of uids.slice(0, 10)) {
      const m = await client.fetchOne(String(uid), { envelope: true }, { uid: true });
      if (!m) continue;
      console.log(`  - ${m.envelope?.date ? new Date(m.envelope.date).toISOString().slice(0, 10) : ''}  ${m.envelope?.subject}`);
    }
  } finally {
    lock.release();
  }
  await client.logout();
} catch (err) {
  const e = err as Error & { responseText?: string };
  console.log(`login/search FAILED: ${e.responseText || e.message}`);
  process.exit(1);
}
process.exit(0);
