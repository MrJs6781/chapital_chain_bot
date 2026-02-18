const { delay, parseDateTimeTz, zonedDate } = require("../utils")
function registerAdmin(bot, storage, config, helpers) {
  const sessions = new Map()
  bot.command("admin", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.reply("دسترسی ندارید")
      return
    }
    const parts = (ctx.message.text || "").trim().split(/\s+/)
    const cmd = parts[1]
    if (cmd === "add" && parts[2]) {
      const token = parts[2]
      const role = parts[3] || "admin"
      const uid = /^\d+$/.test(token) ? Number(token) : await storage.resolveUserIdByUsername(token)
      if (!uid) {
        await ctx.reply("کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید")
        return
      }
      await storage.addAdmin(uid, role)
      await ctx.reply(`ادمین اضافه شد: ${uid} نقش: ${role}`)
      return
    }
    if (cmd === "remove" && parts[2]) {
      const token = parts[2]
      const uid = /^\d+$/.test(token) ? Number(token) : await storage.resolveUserIdByUsername(token)
      if (!uid) {
        await ctx.reply("کاربر یافت نشد؛ از شناسه عددی یا یوزرنیم موجود در دیتابیس استفاده کنید")
        return
      }
      await storage.removeAdmin(uid)
      await ctx.reply(`ادمین حذف شد: ${uid}`)
      return
    }
    if (cmd === "list") {
      const list = await storage.listAdmins()
      const lines = (list || []).map(a => `${a.user_id} ${a.role}`)
      await ctx.reply(lines.length ? lines.join("\n") : "فهرست خالی است")
      return
    }
    await ctx.reply(`دستورات مدیریت:\n/admin add <user_id|@username> [role]\n/admin remove <user_id|@username>\n/admin list`)
  })
  bot.hears(["مدیریت","پنل مدیریت"], async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) return
    const rows = [
      [{ text: "ارسال اعلان", callback_data: "admin:broadcast" }],
      [{ text: "لیست زمان‌بندی‌ها", callback_data: "admin:scheduled" }],
    ]
    if (await helpers.isSuper(ctx)) {
      rows.push([{ text: "افزودن ادمین", callback_data: "admin:add" }, { text: "افزودن سوپرادمین", callback_data: "admin:addsuper" }])
      rows.push([{ text: "حذف ادمین", callback_data: "admin:remove" }, { text: "مدیریت دسترسی‌ها", callback_data: "admin:perms" }])
    }
    rows.push([{ text: "راهنمای ادمین", callback_data: "admin:help" }])
    await ctx.reply("پنل مدیریت", { reply_markup: { inline_keyboard: rows } })
  })
  bot.action("admin:help", async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) {
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    await ctx.reply("دستورات:\n/admin add <user_id|@username> [role]\n/admin remove <user_id|@username>\n/admin list\n/broadcast")
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.command("broadcast", async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) return
    sessions.set(ctx.from.id, { step: "text" })
    await ctx.reply("متن پیام را ارسال کنید")
  })
  bot.action("admin:broadcast", async (ctx) => {
    if (!(await helpers.isAdmin(ctx))) {
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    sessions.set(ctx.from.id, { step: "text" })
    await ctx.reply("متن پیام را ارسال کنید")
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.on("text", async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    if (s.step === "text") {
      s.text = ctx.message.text
      s.step = "parsemode"
      await ctx.reply("قالب پیام را انتخاب کنید", {
        reply_markup: {
          inline_keyboard: [
            [{ text: "بدون قالب", callback_data: "parse:none" }, { text: "HTML", callback_data: "parse:html" }, { text: "Markdown", callback_data: "parse:md" }],
          ],
        },
      })
      return
    }
    if (s.step === "filter") {
      await ctx.reply("فیلتر مخاطبان را انتخاب کنید", {
        reply_markup: {
          inline_keyboard: [
            [
              { text: "همه", callback_data: "filter:all" },
              { text: "فارسی", callback_data: "filter:fa" },
              { text: "انگلیسی", callback_data: "filter:en" },
              { text: "ثبت‌نام", callback_data: "filter:signup" },
            ],
          ],
        },
      })
      return
    }
    if (s.step === "input_hour") {
      const token = (ctx.message.text || "").trim()
      const hNum = Number(token)
      if (!Number.isInteger(hNum) || hNum < 0 || hNum > 23) {
        await ctx.reply("ساعت نامعتبر است. عددی بین 0 تا 23 وارد کنید")
        return
      }
      s.sched = s.sched || {}
      s.sched.hour = String(hNum).padStart(2, "0")
      s.step = "schedule_minute"
      const rows = [
        [
          { text: "00–09", callback_data: "pickminute:range:0" },
          { text: "10–19", callback_data: "pickminute:range:1" },
        ],
        [
          { text: "20–29", callback_data: "pickminute:range:2" },
          { text: "30–39", callback_data: "pickminute:range:3" },
        ],
        [
          { text: "40–49", callback_data: "pickminute:range:4" },
          { text: "50–59", callback_data: "pickminute:range:5" },
        ],
        [{ text: "ورود دستی دقیقه", callback_data: "pickminute:input" }],
      ]
      await ctx.reply("دقیقه را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
      return
    }
    if (s.step === "input_minute") {
      const token = (ctx.message.text || "").trim()
      const mNum = Number(token)
      if (!Number.isInteger(mNum) || mNum < 0 || mNum > 59) {
        await ctx.reply("دقیقه نامعتبر است. عددی بین 0 تا 59 وارد کنید")
        return
      }
      s.sched = s.sched || {}
      s.sched.minute = String(mNum).padStart(2, "0")
      const [y, mo, da] = s.sched.date.split("-").map((x) => Number(x))
      const h = Number(s.sched.hour)
      const mi = Number(s.sched.minute)
      const dt = zonedDate(y, mo, da, h, mi, config.timeZone)
      const { id } = await storage.createBroadcast({
        creator_id: ctx.from.id,
        text: s.text,
        filters: s.filters || {},
        status: "scheduled",
        scheduled_at: dt.toISOString(),
        parse_mode: s.parse || null,
      })
      sessions.delete(ctx.from.id)
      await ctx.reply(`زمان‌بندی شد: #${id} در ${dt.toLocaleString("fa-IR", { timeZone: config.timeZone, hour12: false })}`)
      return
    }
  })
  bot.action(/parse:(.+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    const key = ctx.match[1]
    if (key === 'none') s.parse = null
    else if (key === 'html') s.parse = 'HTML'
    else if (key === 'md') s.parse = 'MarkdownV2'
    s.step = "filter"
    await ctx.answerCbQuery().catch(()=>{})
    await ctx.reply("قالب انتخاب شد. حالا فیلتر مخاطبان را انتخاب کنید", {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "همه", callback_data: "filter:all" },
            { text: "فارسی", callback_data: "filter:fa" },
            { text: "انگلیسی", callback_data: "filter:en" },
            { text: "ثبت‌نام", callback_data: "filter:signup" },
          ],
        ],
      },
    })
  })
  bot.action(/filter:(.+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    const key = ctx.match[1]
    const filters = {}
    if (key === "fa") filters.lang = "fa"
    else if (key === "en") filters.lang = "en"
    else if (key === "signup") filters.event = "signup"
    s.filters = filters
    const ids = await storage.getRecipients(filters)
    await ctx.reply(`پیش‌نمایش:\nگیرندگان: ${ids.length}\n\n${s.text}`, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "ارسال اکنون", callback_data: "send:now" },
            { text: "زمان‌بندی", callback_data: "send:schedule" },
            { text: "پیش‌نمایش", callback_data: "send:preview" },
            { text: "انصراف", callback_data: "send:cancel" },
          ],
        ],
      },
    })
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action(/send:(.+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    const act = ctx.match[1]
    if (act === "cancel") {
      sessions.delete(ctx.from.id)
      await ctx.reply("لغو شد")
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    if (act === "preview") {
      const opts = {}
      if (s.parse) opts.parse_mode = s.parse
      await ctx.reply(s.text, opts)
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    if (act === "now") {
      const ids = await storage.getRecipients(s.filters || {})
      const { id } = await storage.createBroadcast({
        creator_id: ctx.from.id,
        text: s.text,
        filters: s.filters || {},
        status: "pending",
        parse_mode: s.parse || null,
      })
      for (const uid of ids) {
        const opts = {}
        if (s.parse) opts.parse_mode = s.parse
        try { await bot.telegram.sendMessage(uid, s.text, opts) } catch {}
        await delay(30)
      }
      await storage.markBroadcastSent(id)
      sessions.delete(ctx.from.id)
      await ctx.reply(`ارسال شد به ${ids.length} مخاطب`)
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    if (act === "schedule") {
      s.step = "schedule_date"
      const today = new Date()
      const days = []
      for (let i = 0; i < 14; i++) {
        const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() + i)
        const y = d.getFullYear()
        const mo = String(d.getMonth() + 1).padStart(2, "0")
        const da = String(d.getDate()).padStart(2, "0")
        const key = `${y}-${mo}-${da}`
        const names = ["یکشنبه", "دوشنبه", "سه‌شنبه", "چهارشنبه", "پنجشنبه", "جمعه", "شنبه"]
        const lab = `${i === 0 ? "امروز" : i === 1 ? "فردا" : names[d.getDay()]} ${da}/${mo}`
        days.push({ key, lab })
      }
      const rows = []
      for (let i = 0; i < days.length; i += 2) {
        const r = []
        r.push({ text: days[i].lab, callback_data: `pickdate:${days[i].key}` })
        if (days[i + 1]) r.push({ text: days[i + 1].lab, callback_data: `pickdate:${days[i + 1].key}` })
        rows.push(r)
      }
      await ctx.reply("تاریخ ارسال را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
  })
  bot.action(/pickdate:(\d{4}-\d{2}-\d{2})/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    s.sched = s.sched || {}
    s.sched.date = ctx.match[1]
    s.step = "schedule_hour"
    const rows = []
    for (let h = 0; h < 24; h += 6) {
      const r = []
      for (let k = h; k < h + 6; k++) {
        r.push({ text: String(k).padStart(2, "0"), callback_data: `pickhour:${String(k).padStart(2, "0")}` })
      }
      rows.push(r)
    }
    rows.push([{ text: "ورود دستی ساعت", callback_data: "pickhour:input" }])
    await ctx.reply("ساعت را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action(/pickhour:(\d{2})/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    s.sched = s.sched || {}
    s.sched.hour = ctx.match[1]
    s.step = "schedule_minute"
    const rows = [
      [
        { text: "00–09", callback_data: "pickminute:range:0" },
        { text: "10–19", callback_data: "pickminute:range:1" },
      ],
      [
        { text: "20–29", callback_data: "pickminute:range:2" },
        { text: "30–39", callback_data: "pickminute:range:3" },
      ],
      [
        { text: "40–49", callback_data: "pickminute:range:4" },
        { text: "50–59", callback_data: "pickminute:range:5" },
      ],
      [{ text: "ورود دستی دقیقه", callback_data: "pickminute:input" }],
    ]
    await ctx.reply("دقیقه را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action("pickhour:input", async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    s.step = "input_hour"
    await ctx.reply("ساعت را وارد کنید (0 تا 23)")
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action(/pickminute:range:(\d+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    const idx = Number(ctx.match[1])
    const start = idx * 10
    const mins = []
    for (let m = start; m < start + 10; m++) mins.push(String(m).padStart(2, "0"))
    const rows = [
      mins.slice(0, 5).map((m) => ({ text: m, callback_data: `pickminute:${m}` })),
      mins.slice(5, 10).map((m) => ({ text: m, callback_data: `pickminute:${m}` })),
    ]
    await ctx.reply("یک دقیقه را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action("pickminute:input", async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    s.step = "input_minute"
    await ctx.reply("دقیقه را وارد کنید (0 تا 59)")
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action(/pickminute:(\d{2})/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    s.sched = s.sched || {}
    s.sched.minute = ctx.match[1]
    const [y, mo, da] = s.sched.date.split("-").map((x) => Number(x))
    const h = Number(s.sched.hour)
    const mi = Number(s.sched.minute)
    const dt = zonedDate(y, mo, da, h, mi, config.timeZone)
    const { id } = await storage.createBroadcast({
      creator_id: ctx.from.id,
      text: s.text,
      filters: s.filters || {},
      status: "scheduled",
      scheduled_at: dt.toISOString(),
      parse_mode: s.parse || null,
    })
    sessions.delete(ctx.from.id)
    await ctx.reply(`زمان‌بندی شد: #${id} در ${dt.toLocaleString("fa-IR", { timeZone: config.timeZone, hour12: false })}`)
    await ctx.answerCbQuery().catch(()=>{})
  })
  function buildSchedRows(list, page, pages, tz) {
    const rows = []
    for (const b of list) {
      const when = b.scheduled_at ? new Date(b.scheduled_at).toLocaleString("fa-IR", { timeZone: tz, hour12: false }) : '-'
      const title = `#${b.id} • ${when}`
      rows.push([{ text: title, callback_data: `noop` }, { text: "ویرایش", callback_data: `admin:edit:${b.id}` }, { text: "لغو", callback_data: `admin:cancel:${b.id}` }])
    }
    rows.push([
      { text: page > 1 ? "قبلی" : "—", callback_data: `admin:scheduled:${Math.max(1, page - 1)}` },
      { text: `${page}/${pages}`, callback_data: "noop" },
      { text: page < pages ? "بعدی" : "—", callback_data: `admin:scheduled:${Math.min(pages, page + 1)}` },
    ])
    return rows
  }
  bot.action("admin:scheduled", async (ctx) => {
    if (!(await helpers.can(ctx, 'broadcast'))) {
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    const list = await storage.listScheduledBroadcasts()
    if (!list.length) {
      await ctx.reply("هیچ ارسال زمان‌بندی‌شده‌ای وجود ندارد")
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    const page = 1
    const per = 5
    const pages = Math.max(1, Math.ceil(list.length / per))
    const slice = list.slice(0, per)
    await ctx.reply("زمان‌بندی‌ها", { reply_markup: { inline_keyboard: buildSchedRows(slice, page, pages, config.timeZone) } })
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action(/admin:scheduled:(\d+)/, async (ctx) => {
    if (!(await helpers.can(ctx, 'broadcast'))) {
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    const list = await storage.listScheduledBroadcasts()
    if (!list.length) {
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    const per = 5
    const pages = Math.max(1, Math.ceil(list.length / per))
    const page = Math.min(Math.max(1, Number(ctx.match[1])), pages)
    const start = (page - 1) * per
    const slice = list.slice(start, start + per)
    await ctx.reply("زمان‌بندی‌ها", { reply_markup: { inline_keyboard: buildSchedRows(slice, page, pages, config.timeZone) } })
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action(/admin:cancel:(\d+)/, async (ctx) => {
    if (!(await helpers.can(ctx, 'broadcast'))) {
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    const id = Number(ctx.match[1])
    await storage.cancelBroadcast(id)
    await ctx.reply(`لغو شد: #${id}`)
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action(/admin:edit:(\d+)/, async (ctx) => {
    if (!(await helpers.can(ctx, 'broadcast'))) {
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    const id = Number(ctx.match[1])
    sessions.set(ctx.from.id, { step: "edit_text", editId: id })
    await ctx.reply(`متن جدید برای اعلان #${id} را ارسال کنید`)
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.on("text", async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    if (s.step === "edit_text") {
      const ok = await storage.updateScheduledBroadcastText(s.editId, ctx.message.text)
      sessions.delete(ctx.from.id)
      if (ok) await ctx.reply(`متن اعلان #${s.editId} بروزرسانی شد`)
      else await ctx.reply("ویرایش امکان‌پذیر نیست (احتمالاً ارسال شده یا لغو شده است)")
      return
    }
  })
  bot.action("admin:add", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    sessions.set(ctx.from.id, { step: "add_admin_id", role: "admin" })
    await ctx.reply("شناسه عددی یا یوزرنیم کاربر را وارد کنید")
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action("admin:addsuper", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    sessions.set(ctx.from.id, { step: "add_admin_id", role: "superadmin" })
    await ctx.reply("شناسه عددی یا یوزرنیم سوپرادمین را وارد کنید")
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action("admin:remove", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    sessions.set(ctx.from.id, { step: "remove_admin_id" })
    await ctx.reply("شناسه عددی یا یوزرنیم ادمین را برای حذف وارد کنید")
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action("admin:perms", async (ctx) => {
    if (!(await helpers.isSuper(ctx))) {
      await ctx.answerCbQuery().catch(()=>{})
      return
    }
    sessions.set(ctx.from.id, { step: "perms_admin_id" })
    await ctx.reply("شناسه یا یوزرنیم ادمین برای مدیریت دسترسی‌ها را وارد کنید")
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.on("text", async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    if (s.step === "add_admin_id") {
      const token = (ctx.message.text || "").trim()
      const uid = /^\d+$/.test(token) ? Number(token) : await storage.resolveUserIdByUsername(token)
      if (!uid) {
        await ctx.reply("کاربر یافت نشد")
        return
      }
      if (s.role === "superadmin") {
        await storage.addAdmin(uid, "superadmin")
        sessions.delete(ctx.from.id)
        await ctx.reply("سوپرادمین اضافه شد")
        return
      }
      s.candidate = uid
      s.step = "perms_select"
      s.perms = new Set()
      const rows = [[
        { text: "گزارش ✗", callback_data: "perm:toggle:report" },
        { text: "ارسال اعلان ✗", callback_data: "perm:toggle:broadcast" },
      ],
      [{ text: "ذخیره", callback_data: "perm:save" }]]
      await ctx.reply("دسترسی‌ها را انتخاب کنید", { reply_markup: { inline_keyboard: rows } })
      return
    }
    if (s.step === "remove_admin_id") {
      const token = (ctx.message.text || "").trim()
      const uid = /^\d+$/.test(token) ? Number(token) : await storage.resolveUserIdByUsername(token)
      if (!uid) {
        await ctx.reply("کاربر یافت نشد")
        return
      }
      await storage.removeAdmin(uid)
      sessions.delete(ctx.from.id)
      await ctx.reply("ادمین حذف شد")
      return
    }
    if (s.step === "perms_admin_id") {
      const token = (ctx.message.text || "").trim()
      const uid = /^\d+$/.test(token) ? Number(token) : await storage.resolveUserIdByUsername(token)
      if (!uid) {
        await ctx.reply("کاربر یافت نشد")
        return
      }
      const a = await storage.getAdmin(uid)
      if (!a || a.role !== "admin") {
        await ctx.reply("ادمین ساده یافت نشد")
        sessions.delete(ctx.from.id)
        return
      }
      s.editing = uid
      s.step = "perms_edit"
      s.perms = new Set(Array.isArray(a.perms) ? a.perms : [])
      const rep = (p)=> s.perms.has(p) ? "✓" : "✗"
      const rows = [[
        { text: `گزارش ${rep('report')}`, callback_data: "perm:toggle:report" },
        { text: `ارسال اعلان ${rep('broadcast')}`, callback_data: "perm:toggle:broadcast" },
      ],
      [{ text: "ذخیره", callback_data: "perm:update" }]]
      await ctx.reply("دسترسی‌های فعلی:", { reply_markup: { inline_keyboard: rows } })
      return
    }
  })
  bot.action(/perm:toggle:(.+)/, async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s) return
    const key = ctx.match[1]
    s.perms = s.perms || new Set()
    if (s.perms.has(key)) s.perms.delete(key)
    else s.perms.add(key)
    const rep = (p)=> s.perms.has(p) ? "✓" : "✗"
    const rows = [[
      { text: `گزارش ${rep('report')}`, callback_data: "perm:toggle:report" },
      { text: `ارسال اعلان ${rep('broadcast')}`, callback_data: "perm:toggle:broadcast" },
    ],
    [{ text: "ذخیره", callback_data: s.step === "perms_edit" ? "perm:update" : "perm:save" }]]
    await ctx.editMessageReplyMarkup({ inline_keyboard: rows }).catch(async ()=> {
      await ctx.reply("بروزرسانی شد", { reply_markup: { inline_keyboard: rows } })
    })
    await ctx.answerCbQuery().catch(()=>{})
  })
  bot.action("perm:save", async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s || s.step !== "perms_select") return
    const perms = Array.from(s.perms || [])
    await storage.addAdmin(s.candidate, "admin", perms)
    sessions.delete(ctx.from.id)
    await ctx.answerCbQuery().catch(()=>{})
    await ctx.reply("ادمین با دسترسی‌ها ذخیره شد")
  })
  bot.action("perm:update", async (ctx) => {
    const s = sessions.get(ctx.from.id)
    if (!s || s.step !== "perms_edit") return
    const perms = Array.from(s.perms || [])
    await storage.setAdminPerms(s.editing, perms)
    sessions.delete(ctx.from.id)
    await ctx.answerCbQuery().catch(()=>{})
    await ctx.reply("دسترسی‌ها بروزرسانی شد")
  })
}
module.exports = { registerAdmin }
