#!/usr/bin/env node
/**
 * Generates a cryptographically random site password.
 *
 *   npm run password              print a new 13 character password
 *   npm run password -- 20        print one of a different length
 *   npm run password -- --write   make a new 13 character password, print it
 *                                 once, and save only its hash to .env.local
 *
 * The password itself is never written anywhere. .env.local gets
 * SITE_PASSWORD_HASH, a salted scrypt hash in the format server/passwordGate.ts
 * expects (a test checks the two agree), and is made readable by your user
 * only. Copy the password from the terminal straight away, because it cannot
 * be recovered from the hash. Run this in your own terminal rather than
 * through a tool that keeps a log of its output.
 *
 * Characters that dotenv treats specially are left out on purpose:
 * `#` (comment), `$` (variable expansion), quotes, backslash, backtick and
 * whitespace. Look-alike characters (0/O, 1/l/I) are left out too, so the
 * password is easy to read and type.
 */
import { randomBytes, randomInt, scryptSync } from 'node:crypto';
import { chmodSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_LENGTH = 13;
/** The length the site accepts. Must match PASSWORD_LENGTH in server/passwordGate.ts. */
const SITE_LENGTH = 13;
/** Must match the hash format and scrypt parameters in server/passwordGate.ts. */
const SCRYPT_OPTIONS = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

const SETS = {
  upper: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  lower: 'abcdefghijkmnpqrstuvwxyz',
  digit: '23456789',
  symbol: '!@%^&*()-_=+[]{}<>?~.,:;',
};
const ALL = Object.values(SETS).join('');

function pick(chars) {
  // randomInt is uniform, so there is no modulo bias.
  return chars[randomInt(chars.length)];
}

function generate(length) {
  // At least one character from every set, the rest from the full pool.
  const chars = Object.values(SETS).map(pick);
  while (chars.length < length) chars.push(pick(ALL));

  // Fisher-Yates shuffle so the guaranteed characters are not always first.
  for (let i = chars.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function hash(password) {
  const salt = randomBytes(16);
  const key = scryptSync(password, salt, 32, SCRYPT_OPTIONS);
  return `scrypt:${salt.toString('hex')}:${key.toString('hex')}`;
}

function writeEnvLocal(passwordHash) {
  const file = resolve(process.cwd(), '.env.local');
  const line = `SITE_PASSWORD_HASH=${passwordHash}`;
  let content = existsSync(file) ? readFileSync(file, 'utf8') : '';

  // Remove any plain text password left by an older version, with its comment.
  content = content
    .replace(/^# Site access password.*\n/gm, '')
    .replace(/^SITE_PASSWORD=.*(\n|$)/gm, '');

  if (/^SITE_PASSWORD_HASH=.*$/m.test(content)) {
    content = content.replace(/^SITE_PASSWORD_HASH=.*$/m, line);
  } else {
    if (content && !content.endsWith('\n')) content += '\n';
    content += `# Hash of the site password. The password itself is not stored anywhere.\n${line}\n`;
  }
  writeFileSync(file, content, { mode: 0o600 });
  // The mode above only applies when the file is created, so set it again.
  chmodSync(file, 0o600);
  return file;
}

const args = process.argv.slice(2);
const write = args.includes('--write');
const lengthArg = args.find((a) => /^\d+$/.test(a));
const length = lengthArg ? Number(lengthArg) : DEFAULT_LENGTH;

if (length < Object.keys(SETS).length || length > 256) {
  console.error(`Length must be between ${Object.keys(SETS).length} and 256.`);
  process.exit(1);
}
if (write && length !== SITE_LENGTH) {
  console.error(`The site only accepts a ${SITE_LENGTH} character password.`);
  process.exit(1);
}

const password = generate(length);

if (write) {
  // Saved before it is shown, so a failed write never shows a password that is not set.
  const file = writeEnvLocal(hash(password));
  console.log(password);
  console.error(
    `Saved only its hash to ${file}.\n` +
      'Copy the password now. It is not stored anywhere and cannot be shown again.\n' +
      'Restart the dev server if it does not reload.',
  );
} else {
  console.log(password);
}
