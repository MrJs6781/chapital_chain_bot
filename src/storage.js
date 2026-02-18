const fs = require('fs')
const path = require('path')
const DB_FILE = path.join(process.cwd(), 'analytics.json')
if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify({ users: {}, events: [], admins: [], broadcasts: [] }))
}
function readStore() {
  return JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
}
function writeStore(s) {
  fs.writeFileSync(DB_FILE, JSON.stringify(s))
}
async function initDb() {}
async function upsertUser(from) {
  const s = readStore()
  const now = new Date().toISOString()
  const prev = s.users[from.id]
  s.users[from.id] = {
    id: from.id,
    username: from.username || null,
    first_name: from.first_name || null,
    last_name: from.last_name || null,
    language_code: from.language_code || null,
    is_bot: from.is_bot ? 1 : 0,
    created_at: prev && prev.created_at ? prev.created_at : now,
    updated_at: now
  }
  writeStore(s)
}
async function logEvent(userId, type, name, metadata) {
  const s = readStore()
  s.events.push({
    id: s.events.length + 1,
    user_id: userId || null,
    type,
    name,
    ts: new Date().toISOString(),
    metadata: metadata ? JSON.stringify(metadata) : null
  })
  writeStore(s)
}
async function addAdmin(userId, role='admin', perms) {
  const s = readStore()
  const i = (s.admins || []).findIndex(a => a.user_id === userId)
  const rec = { user_id: userId, role, perms: Array.isArray(perms) ? perms : (s.admins?.[i]?.perms || []), created_at: new Date().toISOString() }
  if (i >= 0) s.admins[i] = rec
  else s.admins.push(rec)
  writeStore(s)
}
async function removeAdmin(userId) {
  const s = readStore()
  s.admins = (s.admins || []).filter(a => a.user_id !== userId)
  writeStore(s)
}
async function listAdmins() {
  const s = readStore()
  return s.admins || []
}
async function getAdminRole(userId) {
  const s = readStore()
  const a = (s.admins || []).find(a => a.user_id === userId)
  return a ? a.role : null
}
async function getAdmin(userId) {
  const s = readStore()
  return (s.admins || []).find(a => a.user_id === userId) || null
}
async function setAdminPerms(userId, perms) {
  const s = readStore()
  const i = (s.admins || []).findIndex(a => a.user_id === userId)
  if (i >= 0) {
    s.admins[i].perms = Array.isArray(perms) ? perms : []
    writeStore(s)
  }
}
async function resolveUserIdByUsername(username) {
  if (!username) return null
  const clean = String(username).replace(/^@/,'')
  const s = readStore()
  const found = Object.values(s.users || {}).find(u => (u.username || '').toLowerCase() === clean.toLowerCase())
  return found ? found.id : null
}
async function getStats() {
  const s = readStore()
  const usersTotal = Object.keys(s.users || {}).length
  const startsTotal = (s.events || []).filter(e => e.type === 'start').length
  const clicks = {}
  for (const e of (s.events || [])) {
    if (e.type === 'click') {
      clicks[e.name] = (clicks[e.name] || 0) + 1
    }
  }
  const clicksByName = Object.entries(clicks).map(([name, c]) => ({ name, c })).sort((a,b)=>b.c-a.c)
  return { usersTotal, startsTotal, clicksByName }
}
async function getAllData() {
  const s = readStore()
  const users = Object.values(s.users || {})
  const events = s.events || []
  return { users, events }
}
async function getRecipients(filters) {
  const s = readStore()
  let ids = Object.keys(s.users || {}).map(x => Number(x))
  if (filters && filters.lang) {
    ids = ids.filter(id => ((s.users[id]?.language_code) || '').toLowerCase() === String(filters.lang).toLowerCase())
  }
  if (filters && filters.event === 'signup') {
    const clicked = new Set((s.events || []).filter(e => e.type === 'click' && e.name === 'signup').map(e => e.user_id).filter(Boolean))
    ids = ids.filter(id => clicked.has(id))
  }
  return ids
}
async function createBroadcast(b) {
  const s = readStore()
  const id = (s.broadcasts?.length || 0) + 1
  s.broadcasts = s.broadcasts || []
  s.broadcasts.push({
    id,
    creator_id: b.creator_id,
    text: b.text,
    filters: b.filters || {},
    status: b.status,
    scheduled_at: b.scheduled_at || null,
    sent_at: null,
    parse_mode: b.parse_mode || null,
    created_at: new Date().toISOString()
  })
  writeStore(s)
  return { id }
}
async function listDueBroadcasts(nowIso) {
  const s = readStore()
  const now = new Date(nowIso).getTime()
  return (s.broadcasts || []).filter(b => b.status === 'scheduled' && b.scheduled_at && new Date(b.scheduled_at).getTime() <= now)
}
async function listScheduledBroadcasts() {
  const s = readStore()
  return (s.broadcasts || []).filter(b => b.status === 'scheduled').sort((a,b)=>new Date(a.scheduled_at).getTime()-new Date(b.scheduled_at).getTime())
}
async function markBroadcastSent(id) {
  const s = readStore()
  const i = (s.broadcasts || []).findIndex(b => b.id === id)
  if (i >= 0) {
    s.broadcasts[i].status = 'sent'
    s.broadcasts[i].sent_at = new Date().toISOString()
  }
  writeStore(s)
}
async function cancelBroadcast(id) {
  const s = readStore()
  const i = (s.broadcasts || []).findIndex(b => b.id === id)
  if (i >= 0 && s.broadcasts[i].status === 'scheduled') {
    s.broadcasts[i].status = 'cancelled'
    writeStore(s)
  }
}
async function updateScheduledBroadcastText(id, text) {
  const s = readStore()
  const i = (s.broadcasts || []).findIndex(b => b.id === id)
  if (i >= 0 && s.broadcasts[i].status === 'scheduled') {
    s.broadcasts[i].text = text
    writeStore(s)
    return true
  }
  return false
}
module.exports = { initDb, upsertUser, logEvent, addAdmin, removeAdmin, listAdmins, getAdminRole, getAdmin, setAdminPerms, resolveUserIdByUsername, getStats, getAllData, getRecipients, createBroadcast, listDueBroadcasts, listScheduledBroadcasts, markBroadcastSent, cancelBroadcast, updateScheduledBroadcastText }
