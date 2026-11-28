/**
 * @file scripts/setup-db.ts
 * @description One-time database initialisation script.
 *
 * Creates the SQLite database and all required tables if they don't exist.
 * Safe to re-run — uses CREATE TABLE IF NOT EXISTS.
 *
 * Usage:
 *   npm run setup-db
 *
 * The database path is read from DATABASE_URL in .env (or the environment).
 * Default: file:./src/data.db
 */

import { createClient } from '@libsql/client';
import { mkdirSync } from 'fs';
import { dirname, resolve } from 'path';
import { config } from 'dotenv';

// Load .env so the script works standalone without PM2 or a shell export
config();

// ── Resolve DB path ────────────────────────────────────────────────────────────
const rawUrl: string = process.env.DATABASE_URL ?? 'file:./src/data.db';

// Strip the "file:" prefix to get the filesystem path for directory creation
const fsPath: string = rawUrl.startsWith('file:')
    ? resolve(rawUrl.replace(/^file:/, ''))
    : resolve('./src/data.db');

// Ensure the parent directory exists
mkdirSync(dirname(fsPath), { recursive: true });

console.log('🗄️  Sidak GCS — Database Setup');
console.log(`   Path: ${fsPath}\n`);

// ── Connect & migrate ──────────────────────────────────────────────────────────
const db = createClient({ url: rawUrl });

const tables: { name: string; sql: string }[] = [
    {
        name: 'user',
        sql: `CREATE TABLE IF NOT EXISTS user (
            id            TEXT NOT NULL PRIMARY KEY,
            username      TEXT NOT NULL UNIQUE,
            password_hash TEXT NOT NULL
        )`,
    },
    {
        name: 'session',
        sql: `CREATE TABLE IF NOT EXISTS session (
            id         TEXT    NOT NULL PRIMARY KEY,
            expires_at INTEGER NOT NULL,
            user_id    TEXT    NOT NULL,
            FOREIGN KEY (user_id) REFERENCES user(id)
        )`,
    },
    {
        name: 'mission',
        sql: `CREATE TABLE IF NOT EXISTS mission (
            id       TEXT    NOT NULL PRIMARY KEY,
            title    TEXT    NOT NULL,
            actions  JSON    NOT NULL,
            isLoaded BOOLEAN NOT NULL
        )`,
    },
];

let success = true;

for (const table of tables) {
    try {
        await db.execute(table.sql);
        console.log(`   ✅ Table ready: ${table.name}`);
    } catch (err) {
        console.error(`   ❌ Failed to create table "${table.name}":`, err);
        success = false;
    }
}

await db.close();

if (success) {
    console.log('\n✅ Database initialised successfully.');
} else {
    console.error('\n❌ Some tables failed to initialise. Check errors above.');
    process.exit(1);
}
