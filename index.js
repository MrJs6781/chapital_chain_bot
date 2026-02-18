require("dotenv").config();
const { createApp } = require("./src/server");
const { createBot } = require("./src/bot");
const config = require("./src/config");
const { createScheduler } = require("./src/scheduler");
const driver = process.env.STORAGE_DRIVER === 'pg' ? './src/storage.pg' : './src/storage'
const storage = require(driver)
const app = createApp(storage, config);
const bot = createBot(storage, config);
(async () => {
  await storage.initDb()
  app.listen(config.port);
  bot.launch();
  await bot.telegram.setMyCommands([
    { command: "start", description: "شروع" },
    { command: "help", description: "راهنما" },
  ]);
  const scheduler = createScheduler(storage, bot, config);
  process.once("SIGINT", () => bot.stop("SIGINT"));
  process.once("SIGTERM", () => bot.stop("SIGTERM"));
})();
