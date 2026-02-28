const { app, ipcMain } = require("electron");
const path = require("path");

// Устанавливаем принудительно директорию с данными
app.setPath("userData", path.join(app.getPath("appData"), "resultProxy"));

// Защита от двойного запуска
const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
  process.exit(0);
}

// ---------------------------------------------------------
// 1. Dependency Injection - Импорт всех модулей
// ---------------------------------------------------------
const loggerService = require("./core/logger.service.cjs");
const authManager = require("./core/auth.manager.cjs");
const stateStore = require("./core/state.store.cjs");
const configManager = require("./config/config.manager.cjs");
const SystemFactory = require("./system/system.factory.cjs");
const ProxyManager = require("./proxy/proxy.manager.cjs");
const TrafficMonitor = require("./core/traffic.monitor.cjs");
const ApiServer = require("./api/express.server.cjs");
const WindowManager = require("./electron/window.manager.cjs");
const TrayManager = require("./electron/tray.manager.cjs");
const subscriptionParser = require("./api/subscription.parser.cjs");
const pingManager = require("./api/ping.manager.cjs");
const xrayManager = require("./core/xray.manager.cjs");
const singboxManager = require("./core/singbox.manager.cjs");

// ---------------------------------------------------------
// 2. Инициализация (Сборка приложения)
// ---------------------------------------------------------
const systemAdapter = SystemFactory.getAdapter();
const windowManager = new WindowManager();
const proxyManager = new ProxyManager(loggerService, systemAdapter, stateStore);

// Важно передать proxyManager и trafficMonitor в TrayManager, а TrayManager в ApiServer
// Для решения циклических зависимостей, мы создаем их, а потом связываем если нужно,
// либо передаем ссылки.
const trafficMonitor = new TrafficMonitor(
  loggerService,
  stateStore,
  proxyManager,
  systemAdapter,
);
const trayManager = new TrayManager(
  stateStore,
  proxyManager,
  systemAdapter,
  windowManager,
  trafficMonitor,
  loggerService,
);
const apiServer = new ApiServer(
  loggerService,
  stateStore,
  configManager,
  proxyManager,
  trayManager,
  trafficMonitor,
  systemAdapter,
);

// ---------------------------------------------------------
// 3. Жизненный цикл Electron
// ---------------------------------------------------------

ipcMain.on("get-api-token", (event) => {
  event.returnValue = authManager.getToken();
});

ipcMain.handle("parse-subscription", async (event, input) => {
  try {
    const nodes = await subscriptionParser.processInput(input);
    return { success: true, nodes };
  } catch (e) {
    loggerService.log(`Parse sub error: ${e.message}`, "error");
    return { success: false, error: e.message };
  }
});

ipcMain.handle("ping-nodes", async (event, nodes) => {
  try {
    const results = await pingManager.pingNodes(nodes);
    return { success: true, results };
  } catch (e) {
    loggerService.log(`Ping error: ${e.message}`, "error");
    return { success: false, error: e.message };
  }
});

ipcMain.handle("start-vless", async (event, payload) => {
  try {
    const node = payload.node || payload;
    const rules = payload.rules || { whitelist: [] };
    loggerService.log(`Starting VLESS node: ${node.name}`, "info");

    const stats = await systemAdapter.getNetworkTraffic();
    const sessionStartStats = {
      received: stats.received || 0,
      sent: stats.sent || 0,
    };
    stateStore.update({
      sessionStartStats,
      lastTickStats: { ...sessionStartStats, time: Date.now() },
      bytesReceived: 0,
      bytesSent: 0,
    });

    const config = configManager.getConfig();
    const vpnMode = config?.settings?.vpnMode || "xray";

    if (vpnMode === "singbox") {
      loggerService.log(`Using Sing-box core`, "info");
      await singboxManager.start(node, 10808);
    } else {
      loggerService.log(`Using Xray core`, "info");
      await xrayManager.start(node, 10808);
    }

    // Proxy is created on 10808. We tell the system to use it.
    await systemAdapter.setSystemProxy("127.0.0.1", 10808, "SOCKS5", rules.whitelist, loggerService.log.bind(loggerService));
    stateStore.update({ isVlessActive: true, activeNode: node, proxyType: 'vless' });
    return { success: true };
  } catch (e) {
    loggerService.log(`Failed to start VLESS: ${e.message}`, "error");
    return { success: false, error: e.message };
  }
});

ipcMain.handle("stop-vless", async (event) => {
  try {
    loggerService.log(`Stopping VLESS node`, "info");
    await xrayManager.stop();
    await singboxManager.stop();
    stateStore.update({ isVlessActive: false, activeNode: null, proxyType: null });
    await systemAdapter.disableSystemProxy();
    return { success: true };
  } catch (e) {
    loggerService.log(`Failed to stop VLESS: ${e.message}`, "error");
    return { success: false, error: e.message };
  }
});

app.on("second-instance", () => {
  windowManager.show();
});

app.whenReady().then(() => {
  // ПРЕДОХРАНИТЕЛЬ: ОЧИСТКА ПРИ ЗАПУСКЕ (Синхронно)
  if (
    systemAdapter &&
    typeof systemAdapter.disableSystemProxySync === "function"
  ) {
    systemAdapter.disableSystemProxySync();
  }

  // 1. Инициализируем конфиг
  configManager.init(app.getPath("userData"));
  const config = configManager.getConfig();
  if (config && config.settings && config.settings.killswitch) {
    stateStore.update({ killSwitch: true });
  } else {
    loggerService.log(
      "Конфиг не найден, используются настройки по умолчанию.",
      "warning",
    );
  }

  // 2. Запускаем сборщик процессов для белого списка
  systemAdapter.startProcessCacheInterval(() => stateStore.getState());

  // 3. Стартуем слои
  windowManager.create();
  trayManager.init();
  apiServer.start();
  trafficMonitor.start();
});

// ---------------------------------------------------------
// 4. Ловушки завершения работы
// ---------------------------------------------------------
app.on("session-end", () => {
  if (
    systemAdapter &&
    typeof systemAdapter.disableSystemProxySync === "function"
  ) {
    systemAdapter.disableSystemProxySync();
  }
});

app.on("before-quit", async () => {
  app.isQuitting = true;
  trafficMonitor.stop();

  if (
    systemAdapter &&
    typeof systemAdapter.disableSystemProxySync === "function"
  ) {
    systemAdapter.disableSystemProxySync();
  } else {
    await systemAdapter.disableSystemProxy();
  }

  // Принудительно гасим серверы
  await proxyManager.setSystemProxy(false);
  await xrayManager.stop();
  await singboxManager.stop();
});
