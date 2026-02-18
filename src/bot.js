const { Telegraf } = require("telegraf")
const https = require("https")
const { registerSections } = require("./bot/sections")
const { registerReport } = require("./bot/report")
const { registerAdmin } = require("./bot/admin")
function createBot(storage, config) {
  const agent = new https.Agent({ family: 4 })
  const bot = new Telegraf(process.env.BOT_TOKEN, { telegram: { agent } })
  async function isSuper(ctx) {
    if (config.superAdminId && ctx.from && ctx.from.id === config.superAdminId) return true
    const role = await storage.getAdminRole(ctx.from.id)
    return role === "superadmin"
    }
  async function isAdmin(ctx) {
    if (await isSuper(ctx)) return true
    const role = await storage.getAdminRole(ctx.from.id)
    return !!role
  }
  async function can(ctx, perm) {
    if (await isSuper(ctx)) return true
    const a = await storage.getAdmin(ctx.from.id)
    if (!a) return false
    const perms = Array.isArray(a.perms) ? a.perms : []
    return perms.includes(perm)
  }
  const reportPrefs = new Map()
  registerSections(bot, storage, config, { isSuper, isAdmin, can })
  registerReport(bot, storage, config, reportPrefs, { isSuper, isAdmin, can })
  registerAdmin(bot, storage, config, { isSuper, isAdmin, can })
  bot.command("help", async (ctx) => {
    const t = `دستورات:\n/start شروع\n/help راهنما`
    await ctx.reply(t)
  })
  return bot
}
module.exports = { createBot }
