#!/usr/bin/env node
/**
 * Checks that .env points at a working database, and explains any problem in
 * plain language instead of raw Postgres errors.
 *
 * Run: npm run check:db
 */

import "dotenv/config";
import pg from "pg";

const RESET = "\x1b[0m";
const paint = (code) => (s) => `\x1b[${code}m${s}${RESET}`;
const red = paint(31);
const green = paint(32);
const yellow = paint(33);
const dim = paint(2);
const bold = paint(1);

let problems = 0;
/** Set when a password really does contain a URL-reserved character. */
let sawReserved = false;

function fail(what, why, fix) {
  problems += 1;
  console.log(`${red("✗")} ${bold(what)}`);
  console.log(`  ${why}`);
  if (fix) console.log(`  ${yellow("→")} ${fix}`);
  console.log();
}

function ok(what, detail) {
  console.log(`${green("✓")} ${what}${detail ? ` ${dim(detail)}` : ""}`);
}

/** Placeholders people forget to replace when pasting from .env.example. */
const PLACEHOLDERS = ["YOUR-USER", "YOUR-PASSWORD", "PASSWORD", "PICK_A_STRONG_ONE"];

/**
 * node-postgres recovers a password whether reserved characters are raw or
 * percent-encoded, so "auth failed" is almost never an encoding problem — but
 * Prisma's parser is stricter, so an unencoded character is still worth saying.
 */
function passwordNotes(raw) {
  try {
    const authority = raw.slice(raw.indexOf("//") + 2);
    const at = authority.lastIndexOf("@");
    if (at === -1) return { absent: true, hasReserved: false };
    const creds = authority.slice(0, at);
    const colon = creds.indexOf(":");
    if (colon === -1) return { absent: true, hasReserved: false };
    return { absent: false, hasReserved: /[@:/?#[\]%]/.test(creds.slice(colon + 1)) };
  } catch {
    return { absent: true, hasReserved: false };
  }
}

function inspect(raw) {
  if (!raw) {
    fail("DATABASE_URL is not set", "No connection string found in .env.",
      "Copy .env.example to .env and fill in the database section.");
    return null;
  }

  const hit = PLACEHOLDERS.find((p) => raw.includes(p));
  if (hit) {
    fail("DATABASE_URL still contains a placeholder",
      `It contains "${hit}", which is template text rather than a real value.`,
      "Replace it with your actual Postgres user and database.");
    return null;
  }

  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("DATABASE_URL is not a valid URL",
      "Postgres could not make sense of the string.",
      "It must start with postgres:// or postgresql://. If your password contains @ : / ? # or %, those must be percent-encoded — see the note this script prints at the end.");
    return null;
  }

  const port = url.port || "5432";
  const database = url.pathname.replace(/^\//, "") || "(none)";
  ok("DATABASE_URL looks well-formed", `${url.hostname} · port ${port} · database ${database}`);
  return { raw, database };
}

async function tryConnect(raw, database) {
  const client = new pg.Client({ connectionString: raw, connectionTimeoutMillis: 15_000 });
  try {
    await client.connect();
    const { rows } = await client.query(
      `select count(*)::int as n from information_schema.tables where table_schema = 'public'`,
    );
    const { rows: who } = await client.query(`select current_user, current_database()`);
    ok("Connected",
      `as ${who[0].current_user} to ${who[0].current_database} · ${rows[0].n} table(s) in public`);
    if (rows[0].n === 0) {
      console.log(`  ${yellow("→")} The database is empty. Run ${bold("npx prisma migrate deploy")} to create the tables.`);
    }
    return rows[0].n;
  } catch (err) {
    const msg = String(err?.message ?? err);
    const code = err?.code;
    let why = msg;
    let fix = null;

    if (code === "ENOTFOUND" || /getaddrinfo/i.test(msg)) {
      why = "That hostname does not exist, so the address is wrong.";
      fix = "For a database on this machine the host should be localhost.";
    } else if (code === "ECONNREFUSED") {
      why = "The server refused the connection — nothing is listening there.";
      fix = "Start Postgres: brew services start postgresql@16. Then check the port matches.";
    } else if (code === "ETIMEDOUT" || /timeout/i.test(msg)) {
      why = "The connection timed out.";
      fix = "Usually a firewall, or a host that is not reachable from here.";
    } else if (/password authentication failed|SASL|SCRAM/i.test(msg)) {
      const pw = passwordNotes(raw);
      why = "The server was reached, but rejected the user or password.";
      fix = pw.absent
        ? "The connection string has no password. Add one, or configure Postgres to trust local connections."
        : "Re-check the user and password against the Postgres role you created.";
      if (pw.hasReserved) {
        sawReserved = true;
        fix += " Your password also contains a URL-reserved character; this driver copes, but `prisma migrate` may not — see the note below.";
      }
    } else if (/database .* does not exist/i.test(msg)) {
      why = `There is no database named "${database}" on this server.`;
      fix = `Create it: createdb ${database}`;
    } else if (/role .* does not exist/i.test(msg)) {
      why = "That Postgres role does not exist.";
      fix = "Use your own username (whoami), or create the role: createuser -s <name>";
    } else if (/no pg_hba.conf entry|SSL/i.test(msg)) {
      why = "The server requires SSL and the connection did not offer it.";
      fix = "Append ?sslmode=require to the connection string.";
    }

    fail("Could not connect", why, fix);
    console.log(`  ${dim(`raw error: ${msg}`)}`);
    console.log();
    return null;
  }
}

console.log(`\n${bold("Database check")}\n`);

const target = inspect(process.env.DATABASE_URL);

console.log();
if (target) await tryConnect(target.raw, target.database);

console.log();
if (problems === 0) {
  console.log(green(bold("All good — the app can reach its database.")));
} else {
  console.log(red(bold(`${problems} problem${problems === 1 ? "" : "s"} found.`)) + " Fix the arrows above and run this again.");
  // Only worth printing when a password really does contain one of these —
  // otherwise it reads as the cause of every failure, which it is not.
  if (sawReserved) {
    console.log(dim(`
Note on passwords with special characters: a connection string is a URL, so
these must be replaced wherever they appear in the password:
  @ → %40    : → %3A    / → %2F    ? → %3F    # → %23    % → %25
Simplest fix is to reset the password to letters and numbers only.`));
  }
}
console.log();
process.exit(problems === 0 ? 0 : 1);
