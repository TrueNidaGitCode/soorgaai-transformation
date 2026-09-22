/**
 * A customer's own database, read-only: PostgreSQL or MySQL, one table or
 * one SELECT per dataset.
 *
 * The other connectors speak to a product's API. This one speaks to the
 * place a business actually keeps its records -- the practice management
 * system, the ERP, the booking system -- which is usually a database that
 * somebody else's software writes to. So the rule here is stricter than
 * anywhere else in the application: this module can read and can do
 * nothing else. Not because the credentials would not allow more, but
 * because nothing in Svarg has any business writing to a system it did
 * not build. readOnly() is the whole of that promise, and it is enforced
 * before a statement is ever sent.
 *
 * The driver is imported when it is first needed rather than at the top,
 * so an application whose industry never connects a database neither pays
 * for the module at startup nor fails to start without it.
 */

export const kind = 'database';
export const label = 'Database';
export const help = 'A read-only connection to your own PostgreSQL or MySQL database: one table, view or SELECT per dataset.';

export const fields = [
  { name: 'engine', label: 'Which database', options: ['PostgreSQL', 'MySQL'] },
  { name: 'host', label: 'Host', placeholder: 'db.yourcompany.com' },
  { name: 'port', label: 'Port', placeholder: '5432', required: false, hint: 'Left blank: 5432 for PostgreSQL, 3306 for MySQL.' },
  { name: 'database', label: 'Database name', placeholder: 'clinic' },
  { name: 'user', label: 'User', placeholder: 'A read-only user, ideally' },
  { name: 'password', label: 'Password', secret: true },
  { name: 'ssl', label: 'TLS', options: ['Required', 'Off'], hint: 'Most hosted databases require it.' },
  { name: 'table', label: 'Table or view', placeholder: 'appointments', required: false },
  { name: 'query', label: 'Or a SELECT of your own', placeholder: 'select * from appointments where status = 0', required: false, hint: 'Overrides the table. Reading only: anything that would change your data is refused.' },
];

/**
 * Empty, and deliberately: every other connector reads a product whose
 * fields are known before anyone connects it, so it can name its columns
 * here. A database's columns are the customer's own, and are not known
 * until the connection is made. Declared rather than guessed, so the
 * frame every connector is held to can make the exception explicitly.
 */
export const provides = [];
export const columnsAreTheirs = true;

const PORTS = { postgres: 5432, mysql: 3306 };

/** PostgreSQL unless the config plainly says MySQL. */
export function engineOf(config) {
  return /mysql|maria/i.test(String(config?.engine || '')) ? 'mysql' : 'postgres';
}

function host(config) { return String(config?.host || '').trim(); }

function port(config) {
  const n = Number(String(config?.port || '').trim());
  return Number.isFinite(n) && n > 0 && n < 65536 ? n : PORTS[engineOf(config)];
}

function useTls(config) { return !/^(off|no|false)$/i.test(String(config?.ssl ?? 'Required').trim()); }

/** One name, or schema.name. Anything else is not a table this will quote. */
const IDENT = /^[A-Za-z_][A-Za-z0-9_$]{0,62}(\.[A-Za-z_][A-Za-z0-9_$]{0,62})?$/;

/** Words that do not appear in a statement whose only job is to read. */
const WRITES = /\b(insert|update|delete|drop|alter|create|truncate|replace|merge|grant|revoke|call|do|execute|copy|load|lock|set|commit|rollback|vacuum|attach|outfile|dumpfile|pg_read_file|pg_sleep|sleep|benchmark)\b/i;

/**
 * The read-only gate. A statement passes only if it is a single SELECT (or
 * a WITH that ends in one), carries no second statement, and contains no
 * word that could change anything. Refusals name what was wrong, because
 * the person reading them owns the database.
 */
export function readOnly(sql) {
  const q = String(sql || '').trim().replace(/;+\s*$/, '');
  if (!q) throw new Error('There is no query to run.');
  if (q.includes(';')) throw new Error('Only one statement can run here. Remove the semicolon.');
  if (/--|\/\*/.test(q)) throw new Error('Comments are not allowed in the query.');
  if (!/^(select|with)\b/i.test(q)) throw new Error('This connection can only read, so the query has to start with SELECT.');
  const m = q.match(WRITES);
  if (m) throw new Error('This connection can only read, and the query uses "' + m[0] + '".');
  return q;
}

/** What will actually be sent: the owner's SELECT, or the whole of one table. */
export function statement(config, limit) {
  const n = Math.max(1, Math.min(Number(limit) || 50000, 1000000));
  const raw = String(config?.query || '').trim();
  if (raw) return 'select * from (' + readOnly(raw) + ') as svarg_source limit ' + n;
  const t = String(config?.table || '').trim();
  if (!t) throw new Error('Name the table to read, or write a SELECT.');
  if (!IDENT.test(t)) throw new Error('"' + t + '" is not a table name this can read. Use one name, or schema.name, and write a SELECT for anything else.');
  const quote = engineOf(config) === 'mysql' ? '`' : '"';
  const quoted = t.split('.').map(p => quote + p + quote).join('.');
  return 'select * from ' + quoted + ' limit ' + n;
}

/** A driver value as something a dataset row can hold. */
export function plain(v) {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString();
  if (Buffer.isBuffer(v)) return v.toString('base64');
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

function reason(err, config) {
  const msg = String(err?.message || err);
  const code = String(err?.code || '');
  const both = code + ' ' + msg;
  if (/ENOTFOUND|EAI_AGAIN/.test(code)) return 'No database answers at ' + host(config) + '.';
  if (/ECONNREFUSED/.test(code)) return host(config) + ' refused the connection on port ' + port(config) + '. Check the port, and that this address is allowed to connect.';
  if (/ETIMEDOUT|ESOCKETTIMEDOUT/.test(code)) return host(config) + ' did not answer. A firewall usually has to allow this application’s address.';
  if (/28P01|ER_ACCESS_DENIED_ERROR|password authentication failed|Access denied/i.test(both)) return 'The database refused that user and password.';
  if (/3D000|ER_BAD_DB_ERROR/i.test(both)) return 'There is no database called "' + String(config?.database || '') + '" on that server.';
  if (/42P01|ER_NO_SUCH_TABLE|1146/.test(both)) return 'That table is not there, or this user cannot see it.';
  if (/self.signed|certificate/i.test(msg)) return 'The database’s TLS certificate was refused. Set TLS to Off only if you reach it over a private network.';
  if (/Cannot find (package|module)/i.test(msg)) return 'This application was built without the ' + (engineOf(config) === 'mysql' ? 'MySQL' : 'PostgreSQL') + ' driver.';
  return msg;
}

export function describe(config) {
  const what = String(config?.query || '').trim() ? 'a query' : String(config?.table || '').trim();
  return (engineOf(config) === 'mysql' ? 'MySQL' : 'PostgreSQL') + ' · ' + host(config) + '/' + String(config?.database || '') + (what ? ' · ' + what : '');
}

/** One connection, one statement, rows out. Closed whatever happens. */
async function run(config, sql) {
  const common = {
    host: host(config), port: port(config),
    user: String(config?.user || ''), password: String(config?.password || ''),
    database: String(config?.database || ''),
  };
  if (engineOf(config) === 'mysql') {
    const mysql = (await import('mysql2/promise')).default;
    const conn = await mysql.createConnection({
      ...common,
      ssl: useTls(config) ? { rejectUnauthorized: false } : undefined,
      connectTimeout: 20000, supportBigNumbers: true,
    });
    try {
      const [rows] = await conn.query(sql);
      return Array.isArray(rows) ? rows : [];
    } finally { await conn.end().catch(() => {}); }
  }
  const pg = (await import('pg')).default;
  const client = new pg.Client({
    ...common,
    ssl: useTls(config) ? { rejectUnauthorized: false } : false,
    connectionTimeoutMillis: 20000, statement_timeout: 120000,
  });
  await client.connect();
  try {
    const r = await client.query(sql);
    return r.rows || [];
  } finally { await client.end().catch(() => {}); }
}

export async function test(config) {
  if (!host(config)) throw new Error('Name the host the database runs on.');
  if (!String(config?.database || '').trim()) throw new Error('Name the database to read.');
  const sql = statement(config, 1);
  try {
    const rows = await run(config, sql);
    const cols = rows.length ? Object.keys(rows[0]).length : 0;
    return { ok: true, message: rows.length ? 'Connected. The first row has ' + cols + ' column' + (cols === 1 ? '' : 's') + '.' : 'Connected, and that table is empty for now.' };
  } catch (err) {
    throw new Error(reason(err, config));
  }
}

export async function pull(config, { maxRows = 50000 } = {}) {
  try {
    const rows = await run(config, statement(config, maxRows));
    return rows.map((r) => {
      const out = {};
      for (const k of Object.keys(r)) out[k] = plain(r[k]);
      return out;
    });
  } catch (err) {
    throw new Error(reason(err, config));
  }
}
