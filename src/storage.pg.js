const { Pool } = require('pg')
const url = process.env.DATABASE_URL
const ssl = process.env.PG_SSL === 'true' ? { rejectUnauthorized: process.env.PG_SSL_REJECT_UNAUTHORIZED !== 'false' } : undefined
const pool = new Pool({ connectionString: url, ssl })
async function q(text, params) { return pool.query(text, params || []) }
async function initDb() {}
async function upsertUser(from) {
  const now = new Date().toISOString()
  await q(
    `insert into users (id, username, first_name, last_name, language_code, is_bot, created_at, updated_at)
     values ($1,$2,$3,$4,$5,$6,coalesce((select created_at from users where id=$1),$7),$8)
     on conflict (id) do update set
     username=excluded.username, first_name=excluded.first_name, last_name=excluded.last_name, language_code=excluded.language_code, is_bot=excluded.is_bot, updated_at=excluded.updated_at`,
    [
      from.id,
      from.username || null,
      from.first_name || null,
      from.last_name || null,
      from.language_code || null,
      from.is_bot ? true : false,
      now,
      now,
    ],
  )
}
async function logEvent(userId, type, name, metadata) {
  await q(
    `insert into events (user_id, type, name, ts, metadata) values ($1,$2,$3,$4,$5)`,
    [userId || null, type, name, new Date().toISOString(), metadata ? JSON.stringify(metadata) : null],
  )
}
async function addAdmin(userId, role = 'admin', perms) {
  await q(
    `insert into admins (user_id, role, perms, created_at) values ($1,$2,$3,$4)
     on conflict (user_id) do update set role=excluded.role, perms=excluded.perms`,
    [userId, role, Array.isArray(perms) ? perms : null, new Date().toISOString()],
  )
}
async function removeAdmin(userId) {
  await q(`delete from admins where user_id=$1`, [userId])
}
async function listAdmins() {
  const r = await q(`select user_id, role, perms, created_at from admins order by created_at desc`)
  return r.rows
}
async function getAdminRole(userId) {
  const r = await q(`select role from admins where user_id=$1 limit 1`, [userId])
  return r.rows[0] ? r.rows[0].role : null
}
async function getAdmin(userId) {
  const r = await q(`select user_id, role, perms from admins where user_id=$1 limit 1`, [userId])
  return r.rows[0] || null
}
async function setAdminPerms(userId, perms) {
  await q(`update admins set perms=$2 where user_id=$1`, [userId, Array.isArray(perms) ? perms : []])
}
async function resolveUserIdByUsername(username) {
  if (!username) return null
  const clean = String(username).replace(/^@/,'')
  const r = await q(`select id from users where lower(username)=lower($1) limit 1`, [clean])
  return r.rows[0] ? Number(r.rows[0].id) : null
}
async function getStats() {
  const u = await q(`select count(*)::int as c from users`)
  const s = await q(`select count(*)::int as c from events where type='start'`)
  const c = await q(`select name, count(*)::int as c from events where type='click' group by name order by c desc`)
  return { usersTotal: u.rows[0].c, startsTotal: s.rows[0].c, clicksByName: c.rows }
}
async function getAllData() {
  const users = (await q(`select id, username, first_name, last_name, language_code, is_bot, created_at, updated_at from users order by created_at asc`)).rows
  const events = (await q(`select id, user_id, type, name, ts from events order by id asc`)).rows
  return { users, events }
}
async function getRecipients(filters) {
  const conds = []
  const params = []
  if (filters && filters.lang) {
    params.push(String(filters.lang).toLowerCase())
    conds.push(`language_code is not null and lower(language_code)= $${params.length}`)
  }
  let sql = `select id from users`
  if (filters && filters.event === 'signup') {
    sql = `select u.id from users u where exists (select 1 from events e where e.user_id = u.id and e.type='click' and e.name='signup')`
    if (conds.length) sql += ` and ${conds.join(' and ')}`
  } else {
    if (conds.length) sql += ` where ${conds.join(' and ')}`
  }
  const r = await q(sql, params)
  return r.rows.map((x) => Number(x.id))
}
async function createBroadcast(b) {
  const r = await q(
    `insert into broadcasts (creator_id, text, filters, status, scheduled_at, parse_mode, created_at)
     values ($1,$2,$3,$4,$5,$6,$7) returning id`,
    [
      b.creator_id,
      b.text,
      b.filters ? JSON.stringify(b.filters) : JSON.stringify({}),
      b.status,
      b.scheduled_at || null,
      b.parse_mode || null,
      new Date().toISOString(),
    ],
  )
  return { id: r.rows[0].id }
}
async function listDueBroadcasts(nowIso) {
  const r = await q(
    `select id, creator_id, text, filters, status, scheduled_at, sent_at, parse_mode, created_at
     from broadcasts
     where status='scheduled' and scheduled_at is not null and scheduled_at <= $1
     order by scheduled_at asc`,
    [nowIso],
  )
  return r.rows
}
async function listScheduledBroadcasts() {
  const r = await q(
    `select id, creator_id, text, filters, status, scheduled_at, sent_at, parse_mode, created_at
     from broadcasts
     where status='scheduled'
     order by scheduled_at asc`,
  )
  return r.rows
}
async function markBroadcastSent(id) {
  await q(`update broadcasts set status='sent', sent_at=now() where id=$1`, [id])
}
async function cancelBroadcast(id) {
  await q(`update broadcasts set status='cancelled' where id=$1 and status='scheduled'`, [id])
}
async function updateScheduledBroadcastText(id, text) {
  const r = await q(`update broadcasts set text=$2 where id=$1 and status='scheduled'`, [id, text])
  return r.rowCount > 0
}
module.exports = { initDb, upsertUser, logEvent, addAdmin, removeAdmin, listAdmins, getAdminRole, getAdmin, setAdminPerms, resolveUserIdByUsername, getStats, getAllData, getRecipients, createBroadcast, listDueBroadcasts, listScheduledBroadcasts, markBroadcastSent, cancelBroadcast, updateScheduledBroadcastText }
