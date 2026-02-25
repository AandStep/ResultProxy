const SocksServer = require("./socks.server.cjs");
const HttpServer = require("./http.server.cjs");

class ProxyManager {
  constructor(loggerService, systemAdapter, stateStore) {
    this.logger = loggerService;
    this.systemAdapter = systemAdapter;
    this.stateStore = stateStore;

    this.socksServer = new SocksServer(
      loggerService,
      systemAdapter,
      stateStore,
    );
    this.httpServer = new HttpServer(loggerService, systemAdapter, stateStore);
  }

  async setSystemProxy(enable, proxy = null, updateRegistryOnly = false) {
    if (!updateRegistryOnly) {
      await this.httpServer.stop();
      this.socksServer.stop();
    }

    let proxyIp = "127.0.0.1";
    let proxyPort = "14081";
    let proxyType = "ALL";
    let rules = {
      mode: "global",
      whitelist: ["localhost", "127.0.0.1"],
      appWhitelist: [],
    };

    if (enable && proxy) {
      proxyIp = proxy.ip;
      proxyPort = proxy.port;
      proxyType = proxy.type || "HTTP";
      rules = proxy.rules || rules;

      // If SOCKS5 or HTTP with Auth requires a local bridge
      if (proxyType === "SOCKS5" || (proxy.username && proxy.password)) {
        if (!updateRegistryOnly) {
          if (proxyType === "SOCKS5") {
            const result = await this.socksServer.start(proxy);
            proxyIp = result.host;
            proxyPort = result.port;
            proxyType = "ALL";
          } else {
            const result = await this.httpServer.start(proxy);
            proxyIp = result.host;
            proxyPort = result.port;
            proxyType = "ALL";
          }
        } else {
          proxyIp = "127.0.0.1";
          proxyPort = "14081";
          proxyType = "ALL";
        }
      }

      await this.systemAdapter.setSystemProxy(
        proxyIp,
        proxyPort,
        proxyType,
        rules.whitelist,
        !updateRegistryOnly ? this.logger.log.bind(this.logger) : null,
      );
    } else {
      await this.systemAdapter.disableSystemProxy(
        this.logger.log.bind(this.logger),
      );
    }
  }

  async applyKillSwitch() {
    await this.systemAdapter.applyKillSwitch(this.logger.log.bind(this.logger));
  }
}

module.exports = ProxyManager;
