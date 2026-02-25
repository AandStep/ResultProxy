const { Tray, Menu, nativeImage, app } = require("electron");
const path = require("path");

class TrayManager {
  constructor(
    stateStore,
    proxyManager,
    systemAdapter,
    windowManager,
    trafficMonitor,
    logger,
  ) {
    this.stateStore = stateStore;
    this.proxyManager = proxyManager;
    this.systemAdapter = systemAdapter;
    this.windowManager = windowManager;
    this.trafficMonitor = trafficMonitor;
    this.logger = logger;
    this.tray = null;
  }

  init() {
    const iconPath =
      process.env.NODE_ENV === "development"
        ? path.join(__dirname, "../../public", "logo.png")
        : path.join(__dirname, "../../dist", "logo.png");

    let trayIcon = nativeImage.createFromPath(iconPath);

    if (trayIcon.isEmpty()) {
      const fallbackBase64 =
        "iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAAZElEQVQ4T2NkoBAwUqifYdQAhoEwMCzIz/9PhH5GUjTjM4jRgFmwgVEQx8I3jGwA3Awm+QUY/v//z4BVA27XkGwALuPRjEExAIfL0DUQsoEuDbiSBaMWUFAzYvU/sYKQ3AAiBwAASiowZf1PzCgAAAAASUVORK5CYII=";
      trayIcon = nativeImage.createFromBuffer(
        Buffer.from(fallbackBase64, "base64"),
      );
    }

    this.tray = new Tray(trayIcon);
    this.tray.setToolTip("ResultProxy");

    this.tray.on("click", () => {
      this.windowManager.toggle();
    });

    this.updateMenu();
  }

  updateMenu() {
    if (!this.tray) return;

    const state = this.stateStore.getState();

    const menuTemplate = [
      {
        label: state.isConnected
          ? `Подключено: ${state.activeProxy?.name || "Неизвестно"}`
          : "Отключено",
        enabled: false,
      },
      { type: "separator" },
      { label: "Развернуть окно", click: () => this.windowManager.show() },
      { type: "separator" },
    ];

    if (state.uiProxies.length > 0) {
      menuTemplate.push({ label: "Сохраненные серверы", enabled: false });
      state.uiProxies.forEach((p) => {
        const isCurrent = state.isConnected && state.activeProxy?.id === p.id;
        menuTemplate.push({
          label: `${isCurrent ? "✓ " : "  "} ${p.name}`,
          click: async () => {
            if (isCurrent) return;

            const { alive } = await this.trafficMonitor.pingProxy(p.ip, p.port);
            if (!alive && !state.killSwitch) {
              return;
            }

            const stats = await this.systemAdapter.getNetworkTraffic();
            const sessionStartStats = {
              received: stats.received || 0,
              sent: stats.sent || 0,
            };

            this.stateStore.update({
              sessionStartStats,
              lastTickStats: { ...sessionStartStats, time: Date.now() },
              bytesReceived: 0,
              bytesSent: 0,
            });

            await this.proxyManager.setSystemProxy(true, p);

            this.stateStore.update({
              isConnected: true,
              activeProxy: p,
              isProxyDead: !alive,
            });

            if (!alive && state.killSwitch) {
              await this.proxyManager.applyKillSwitch();
            }

            this.updateMenu();
          },
        });
      });
      menuTemplate.push({ type: "separator" });
    }

    if (state.isConnected) {
      menuTemplate.push({
        label: "Отключить защиту",
        click: async () => {
          await this.proxyManager.setSystemProxy(false);
          this.stateStore.update({
            isConnected: false,
            activeProxy: null,
            isProxyDead: false,
          });
          this.updateMenu();
        },
      });
    }

    menuTemplate.push({
      label: "Выход",
      click: () => {
        app.isQuitting = true;
        app.quit();
      },
    });

    this.tray.setContextMenu(Menu.buildFromTemplate(menuTemplate));
  }
}

module.exports = TrayManager;
