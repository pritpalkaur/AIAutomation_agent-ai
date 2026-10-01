import 'dotenv/config';

const env = process.env;

export const config = {
  port: Number(env.PORT ?? 4000),

  db: {
    server: env.DB_SERVER ?? 'localhost',
    port: env.DB_PORT ? Number(env.DB_PORT) : undefined,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    options: {
      instanceName: env.DB_INSTANCE || undefined,
      encrypt: env.DB_ENCRYPT === 'true',
      trustServerCertificate: env.DB_TRUST_CERT !== 'false',
    },
  },

  gmail: {
    user: env.GMAIL_USER,
    // Google shows App Passwords as "abcd efgh ijkl mnop"; the spaces are not part of it.
    appPassword: env.GMAIL_APP_PASSWORD?.replace(/\s/g, ''),
    mailbox: env.GMAIL_MAILBOX ?? 'INBOX',
    subjectKeyword: env.EMAIL_SUBJECT_KEYWORD ?? 'data1',
    processedLabel: env.EMAIL_PROCESSED_LABEL ?? 'pain-processed',
    pollMinutes: Number(env.EMAIL_POLL_MINUTES ?? 5),
  },

  ai: {
    // AI extraction turns on automatically when an Anthropic API key is present.
    enabled: Boolean(env.ANTHROPIC_API_KEY) && env.AI_EXTRACTION !== 'off',
    model: env.AI_MODEL ?? 'claude-opus-5-5',
    maxInputChars: Number(env.AI_MAX_INPUT_CHARS ?? 50_000),
  },
};

export const gmailConfigured = Boolean(config.gmail.user && config.gmail.appPassword);
