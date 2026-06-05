// Centralised, validated environment configuration.
// Node 20+ loads .env automatically when started with --env-file, but tsx does
// not, so we read process.env directly (Prisma loads .env itself for the CLI).
import 'dotenv/config';

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

// CORS origins. Default '*' (allow any) — fine here because auth is a JWT
// Bearer header, not cookies. Set CLIENT_ORIGIN to a comma list to restrict.
const rawOrigin = process.env.CLIENT_ORIGIN ?? '*';
const corsOrigin: true | string[] =
  rawOrigin === '*' ? true : rawOrigin.split(',').map((s) => s.trim());

export const env = {
  port: Number(process.env.PORT ?? 4000),
  // Public base URL of this server. Used to build absolute avatar/attachment
  // URLs — MUST be set to your tunnel/public URL when hosting, or remote
  // clients get unreachable localhost links.
  publicUrl: process.env.SERVER_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 4000}`,
  clientOrigins: corsOrigin,
  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    refreshSecret: required('JWT_REFRESH_SECRET'),
    accessTtl: process.env.JWT_ACCESS_TTL ?? '15m',
    refreshTtl: process.env.JWT_REFRESH_TTL ?? '30d',
  },
};
