import dotenv from 'dotenv';

dotenv.config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

// Validate SESSION_SECRET: Do not allow predictable fallbacks outside test environment
const sessionSecret = process.env.SESSION_SECRET;

if (!sessionSecret) {
  if (!isTest) {
    throw new Error(
      'FATAL: SESSION_SECRET environment variable is required and must not be empty in development or production.'
    );
  }
} else if (!isTest && sessionSecret.length < 32) {
  throw new Error(
    'FATAL: SESSION_SECRET must be at least 32 characters long for cryptographic security.'
  );
}

export const config = {
  port: parseInt(process.env.PORT, 10) || 5000,
  nodeEnv,
  // Strip any trailing slash to ensure consistent Origin header comparison in CSRF validation
  clientUrl: (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/+$/, ''),
  databaseUrl: process.env.DATABASE_URL,
  sessionSecret: sessionSecret || (isTest ? 'test-session-secret-for-vitest-deterministic-runs-only-32chars' : ''),
  isProduction,
  isTest,
};
