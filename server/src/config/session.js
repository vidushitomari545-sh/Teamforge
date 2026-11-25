import session from 'express-session';
import connectPgSimple from 'connect-pg-simple';
import pg from 'pg';
import { config } from './env.js';

const { Pool } = pg;

export let sessionPool = null;
let store;

if (config.isTest) {
  // Explicit test-only session store:
  // In automated test runs (Vitest), MemoryStore is explicitly used to ensure test suites
  // run deterministically and fast in-memory without requiring an external PostgreSQL service.
  store = new session.MemoryStore();
} else {
  // Architectural Note:
  // Prisma in TeamForge utilizes @prisma/adapter-pg with an encapsulated driver adapter
  // that does not expose a reusable pg.Pool. Therefore, a dedicated pg.Pool is configured
  // here specifically for connect-pg-simple with conservative connection limits to prevent pool exhaustion.
  sessionPool = new Pool({
    connectionString: config.databaseUrl,
    max: 10, // Maximum 10 concurrent connections for session management
    idleTimeoutMillis: 30000, // Close idle clients after 30 seconds
    connectionTimeoutMillis: 5000, // Fail fast if PostgreSQL is unreachable after 5 seconds
  });

  sessionPool.on('error', (err) => {
    console.error('[Session Store Pool Error] Unexpected error on idle database client:', err);
  });

  const PgSession = connectPgSimple(session);

  store = new PgSession({
    pool: sessionPool,
    tableName: 'session',
    createTableIfMissing: true, // Automatically provisions "session" table & expire index if missing
  });
}

/**
 * Session cookie options shared across session creation and cookie clearing.
 * Must be passed to res.clearCookie() so browsers recognise the deletion instruction.
 */
export const SESSION_COOKIE_NAME = 'teamforge.sid';

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: config.isProduction, // false in local HTTP development, true in HTTPS production
  sameSite: 'lax',
  path: '/',
};

export const sessionMiddleware = session({
  name: SESSION_COOKIE_NAME,
  secret: config.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  store,
  cookie: {
    ...SESSION_COOKIE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds (604,800,000 ms)
  },
});
