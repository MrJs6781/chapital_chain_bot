const { Telegraf } = require("telegraf");
require("dotenv").config();

const bot = new Telegraf(process.env.BOT_TOKEN);

const channelUrl = process.env.CHANNEL_URL;
const signupUrl = process.env.SIGNUP_URL;
const siteFaUrl = process.env.SITE_FA_URL;
const rulesUrl = process.env.RULES_URL;
const supportUrl = process.env.SUPPORT_URL;
const imageUrl = process.env.IMAGE_URL;
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

bot.start(async (ctx) => {
  if (imageUrl) {
    await ctx.replyWithPhoto(imageUrl);
    await delay(500);
  }
  await ctx.reply(
    `👋 به ربات فارسی CapitalChin خوش آمدید
خوشحالیم که به جامعه تریدرهای فارسی‌زبان CapitalChin  پیوستید.
این ربات برای دسترسی سریع، پشتیبانی و اطلاع‌رسانی طراحی شده تا تجربه معاملاتی ساده‌تر و حرفه‌ای‌تری داشته باشید.

🔹 در این ربات چه امکاناتی دارید؟
📌 ثبت‌نام و شروع همکاری
ایجاد حساب کاربری و شروع مسیر ترید

📌 کانال اطلاع‌رسانی رسمی
اخبار، آپدیت‌ها، تورنمنت‌ها و اطلاعیه‌های مهم
🔗 کانال رسمی:
👉 https://t.me/capitalchainfa`,
    {
      reply_markup: {
        inline_keyboard: [[{ text: "کانال رسمی", url: channelUrl }]],
      },
    },
  );
  await delay(700);
  await ctx.reply(`🔗 لینک ثبت‌نام:\n👉 https://checkout.capitalchain.co`, {
    reply_markup: { inline_keyboard: [[{ text: "ثبت‌نام", url: signupUrl }]] },
  });
  await delay(700);
  await ctx.reply(`📌 ورود به سایت فارسی کپیتال چین\n🔗 http://CapitalChain.co/farsi`, {
    reply_markup: { inline_keyboard: [[{ text: "سایت فارسی", url: siteFaUrl }]] },
  });
  await delay(700);
  await ctx.reply(
    `📌 قوانین و شرایط
مطالعه قوانین، پلن‌ها و شرایط برداشت
🔗 قوانین و مقررات:
👉 https://capitalchain.co/terms-of-use`,
    { reply_markup: { inline_keyboard: [[{ text: "قوانین و شرایط", url: rulesUrl }]] } },
  );
  await delay(700);
  await ctx.reply(
    `📌 پشتیبانی فارسی
در صورت داشتن هرگونه سوال یا مشکل، با پشتیبانی در ارتباط باشید
🔗 پشتیبانی تلگرام:
👉 https://t.me/CapitalChainfarsi_support`,
    { reply_markup: { inline_keyboard: [[{ text: "پشتیبانی تلگرام", url: supportUrl }]] } },
  );
});

bot.launch();

process.once("SIGINT", () => bot.stop("SIGINT"));
process.once("SIGTERM", () => bot.stop("SIGTERM"));
