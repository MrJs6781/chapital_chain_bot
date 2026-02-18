const { delay, makeUrl } = require("../utils")
function getTarget(config, name) {
  const fallback = {
    channel: "https://t.me/capitalchainfa",
    signup: "https://checkout.capitalchain.co",
    "site-fa": "http://CapitalChain.co/farsi",
    rules: "https://capitalchain.co/terms-of-use",
    support: "https://t.me/CapitalChainfarsi_support",
  }
  return (config.targets && config.targets[name]) || fallback[name]
}
function sectionText(config, name) {
  if (name === "channel") {
    return {
      title: "📌 کانال اطلاع‌رسانی رسمی",
      text: "اخبار، آپدیت‌ها، تورنمنت‌ها و اطلاعیه‌های مهم را از این کانال دنبال کنید.\nبرای اطلاع از آخرین خبرها عضو شوید.",
      url: getTarget(config, "channel"),
      btn: "مشاهده کانال رسمی",
    }
  }
  if (name === "signup") {
    return {
      title: "📌 ثبت‌نام و شروع همکاری",
      text: "ایجاد حساب کاربری و شروع مسیر ترید در کپیتال چین.\nثبت‌نام کنید و مسیر دریافت سرمایه را آغاز کنید.",
      url: getTarget(config, "signup"),
      btn: "ورود به ثبت‌نام",
    }
  }
  if (name === "site-fa") {
    return {
      title: "📌 ورود به سایت فارسی کپیتال چین",
      text: "در سایت فارسی، اطلاعات کامل درباره پراپ فرم، پلن‌ها و قوانین را مطالعه کنید.",
      url: getTarget(config, "site-fa"),
      btn: "ورود به سایت فارسی",
    }
  }
  if (name === "rules") {
    return {
      title: "📌 قوانین و شرایط",
      text: "مطالعه قوانین، پلن‌ها و شرایط برداشت.\nقبل از شروع همکاری، قوانین را با دقت مطالعه کنید.",
      url: getTarget(config, "rules"),
      btn: "مشاهده قوانین و مقررات",
    }
  }
  if (name === "support") {
    return {
      title: "📌 پشتیبانی فارسی",
      text: "در صورت داشتن هرگونه سؤال یا مشکل، با پشتیبانی فارسی در ارتباط باشید.\nساعات پاسخگویی: دوشنبه تا جمعه 10:00 تا 00:00، شنبه و یکشنبه 10:00 تا 15:00",
      url: getTarget(config, "support"),
      btn: "ارتباط با پشتیبانی",
    }
  }
  return null
}
function registerSections(bot, storage, config, helpers) {
  async function sendStart(ctx) {
    await storage.upsertUser(ctx.from)
    await storage.logEvent(ctx.from.id, "start", "start")
    if (config.imageUrl) {
      await ctx.replyWithPhoto(config.imageUrl)
      await delay(500)
    }
    const rows = [
      [{ text: "کانال رسمی", callback_data: "section:channel" }],
      [
        { text: "ثبت‌نام", callback_data: "section:signup" },
        { text: "سایت فارسی", callback_data: "section:site-fa" },
      ],
      [
        { text: "قوانین و شرایط", callback_data: "section:rules" },
        { text: "پشتیبانی تلگرام", callback_data: "section:support" },
      ],
    ]
    try {
      if (helpers && await helpers.can && await helpers.can(ctx, 'report')) rows.push([{ text: "مشاهده گزارش", callback_data: "stats" }])
    } catch {}
    await ctx.reply(
      `👋 به ربات فارسی CapitalChin خوش آمدید
برای دسترسی سریع به بخش‌های مختلف از دکمه‌های زیر استفاده کنید.`,
      { reply_markup: { inline_keyboard: rows } },
    )
    let kb = [[{ text: "شروع" }], [{ text: "راهنما" }]]
    try {
      if (helpers && await helpers.isAdmin(ctx)) {
        const left = [{ text: "شروع" }]
        if (helpers.can ? await helpers.can(ctx, 'report') : true) left.push({ text: "گزارش" })
        kb = [left, [{ text: "راهنما" }, { text: "مدیریت" }]]
      }
    } catch {}
    await ctx.reply(`منوی اصلی`, {
      reply_markup: {
        keyboard: kb,
        resize_keyboard: true,
        one_time_keyboard: false,
      },
    })
  }
  bot.start(async (ctx) => {
    try {
      await sendStart(ctx)
    } catch {}
  })
  bot.hears("شروع", async (ctx) => {
    try {
      await sendStart(ctx)
    } catch {}
  })
  bot.action(/section:(.+)/, async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{})
    const name = ctx.match[1]
    const info = sectionText(config, name)
    if (!info) {
      await ctx.answerCbQuery("نامعتبر").catch(()=>{})
      return
    }
    try {
      await storage.logEvent(ctx.from.id, "open", name)
    } catch {}
    const tracked = makeUrl(config.redirectBase, name, ctx.from.id)
    const text =
      `${info.title}\n` +
      `${info.text}\n` +
      `\nلینک: ${info.url}`
    const rows = [
      [{ text: info.btn, url: tracked }],
      [{ text: "بازگشت به منوی اصلی", callback_data: "menu:home" }],
    ]
    await ctx.reply(text, { reply_markup: { inline_keyboard: rows } })
  })
  bot.action("menu:home", async (ctx) => {
    await ctx.answerCbQuery().catch(()=>{})
    await sendStart(ctx)
  })
}
module.exports = { registerSections }
