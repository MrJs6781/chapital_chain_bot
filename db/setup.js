const { Pool } = require('pg')

function sslFromEnv(prefix) {
  const on = process.env[`${prefix}_SSL`] === 'true' || process.env.PG_SSL === 'true'
  if (!on) return undefined
  const rej = process.env[`${prefix}_SSL_REJECT_UNAUTHORIZED`]
  const rejPg = process.env.PG_SSL_REJECT_UNAUTHORIZED
  return { rejectUnauthorized: (rej ?? rejPg) !== 'false' }
}

function superPool() {
  const dsn = process.env.PG_SUPER_DSN
  if (dsn) return new Pool({ connectionString: dsn, ssl: sslFromEnv('PG_SUPER') })
  const host = process.env.PG_HOST || 'localhost'
  const port = process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432
  const user = process.env.PG_SUPER_USER || 'postgres'
  const password = process.env.PG_SUPER_PASSWORD || undefined
  return new Pool({ host, port, user, password, database: 'postgres', ssl: sslFromEnv('PG_SUPER') })
}

function appPoolAsSuper(db) {
  const dsn = process.env.PG_SUPER_DSN
  if (dsn) return new Pool({ connectionString: dsn.replace(/\/[^/]+(\?.*)?$/, `/${db}$1`), ssl: sslFromEnv('PG_SUPER') })
  const host = process.env.PG_HOST || 'localhost'
  const port = process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432
  const user = process.env.PG_SUPER_USER || 'postgres'
  const password = process.env.PG_SUPER_PASSWORD || undefined
  return new Pool({ host, port, user, password, database: db, ssl: sslFromEnv('PG_SUPER') })
}

function appPool(db, user, password) {
  const host = process.env.PG_HOST || 'localhost'
  const port = process.env.PG_PORT ? Number(process.env.PG_PORT) : 5432
  return new Pool({ host, port, user, password, database: db, ssl: sslFromEnv('PG') })
}

async function ensureRole(client, role, pass) {
  const r = await client.query(`select 1 from pg_roles where rolname=$1`, [role])
  if (r.rowCount === 0) {
    await client.query(`create role ${role} with login password $1`, [pass])
  } else {
    await client.query(`alter role ${role} with login password $1`, [pass])
  }
}

async function ensureDb(client, db, owner) {
  const r = await client.query(`select 1 from pg_database where datname=$1`, [db])
  if (r.rowCount === 0) {
    await client.query(`create database ${db} owner ${owner} encoding 'UTF8'`)
  } else {
    await client.query(`alter database ${db} owner to ${owner}`)
  }
}

async function grantDefaults(superAppClient, owner) {
  await superAppClient.query(`grant usage on schema public to ${owner}`)
  await superAppClient.query(`grant all privileges on all tables in schema public to ${owner}`)
  await superAppClient.query(`grant all privileges on all sequences in schema public to ${owner}`)
  await superAppClient.query(`alter default privileges in schema public grant select, insert, update, delete on tables to ${owner}`)
  await superAppClient.query(`alter default privileges in schema public grant usage, select, update on sequences to ${owner}`)
}

async function createTables(appClient) {
  const ddl = `
  create table if not exists users (
    id bigint primary key,
    username text,
    first_name text,
    last_name text,
    language_code text,
    is_bot boolean default false,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
  create table if not exists events (
    id bigserial primary key,
    user_id bigint,
    type text not null,
    name text,
    ts timestamptz not null default now(),
    metadata jsonb
  );
  create index if not exists idx_events_user_time on events(user_id, ts);
  create index if not exists idx_events_type_name on events(type, name);
  create table if not exists admins (
    user_id bigint primary key,
    role text not null,
    perms text[],
    created_at timestamptz not null default now()
  );
  create table if not exists broadcasts (
    id bigserial primary key,
    creator_id bigint not null,
    text text not null,
    filters jsonb not null default '{}'::jsonb,
    status text not null,
    scheduled_at timestamptz,
    sent_at timestamptz,
    parse_mode text,
    created_at timestamptz not null default now()
  );
  create index if not exists idx_broadcasts_status_sched on broadcasts(status, scheduled_at);
  `
  await appClient.query(ddl)
}

async function main() {
  const db = process.env.PG_APP_DB || 'telegram_bot'
  const user = process.env.PG_APP_USER || 'bot_user'
  const pass = process.env.PG_APP_PASSWORD
  if (!pass) {
    console.error('PG_APP_PASSWORD is required')
    process.exit(1)
  }
  console.log('connecting as superuser...')
  const superClient = await superPool().connect()
  try {
    console.log('ensuring role...')
    await ensureRole(superClient, user, pass)
    console.log('ensuring database...')
    await ensureDb(superClient, db, user)
  } finally {
    superClient.release()
  }
  console.log('connecting to app database as superuser...')
  const superAppClient = await appPoolAsSuper(db).connect()
  try {
    console.log('granting defaults...')
    await grantDefaults(superAppClient, user)
  } finally {
    superAppClient.release()
  }
  console.log('connecting to app database as app user...')
  const appClient = await appPool(db, user, pass).connect()
  try {
    console.log('creating tables if not exist...')
    await createTables(appClient)
  } finally {
    appClient.release()
  }
  console.log('done')
  process.exit(0)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})

