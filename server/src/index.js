import { app } from './app.js';
import { config, gmailConfigured } from './config.js';
import { processInbox } from './emailWorker.js';

app.listen(config.port, () => {
  console.log(`API listening on http://localhost:${config.port}`);
});

async function checkEmail() {
  try {
    const summary = await processInbox();
    if (summary.skipped) return;
    console.log(
      `[email] ${summary.emails} email(s), ${summary.attachments} attachment(s), ` +
        `${summary.aiEmails} read by AI, ` +
        `${summary.inserted} row(s) inserted, ${summary.rejectedRows.length} row(s) rejected`,
    );
    for (const row of summary.rejectedRows) {
      console.warn(`[email] rejected ${row.file} row ${row.row}: ${row.errors.join('; ')}`);
    }
    for (const failed of summary.failedEmails) {
      console.error(`[email] email uid ${failed.uid} failed: ${failed.error}`);
    }
  } catch (err) {
    console.error('[email] check failed:', err.message);
  }
}

console.log(
  config.ai.enabled
    ? `[ai] AI extraction on (${config.ai.model}); emails without attachments are read from their text`
    : '[ai] AI extraction off (no ANTHROPIC_API_KEY); only .xlsx/.json attachments are imported',
);

if (!gmailConfigured) {
  console.warn('[email] GMAIL_USER / GMAIL_APP_PASSWORD not set; email polling is off');
} else if (config.gmail.pollMinutes > 0) {
  checkEmail();
  setInterval(checkEmail, config.gmail.pollMinutes * 60_000);
}
