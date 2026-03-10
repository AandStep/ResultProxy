const ProxyChain = require("proxy-chain");
const { isWhitelisted } = require("../utils/domain.cjs");

const BLOCKED_RESOURCES = [
  "instagram.com",
  "facebook.com",
  "twitter.com",
  "x.com",
  "t.me",
  "discord.com",
  "netflix.com",
];

class HttpServer {
  constructor(loggerService, systemAdapter, stateStore) {
    this.logger = loggerService;
    this.systemAdapter = systemAdapter;
    this.stateStore = stateStore;
    this.server = null;
    this.port = 14081;
    this.host = "127.0.0.1";
  }

  async start(proxyConfig) {
    if (this.server) {
      await this.stop();
    }

    this.logger.log(
      "[МОСТ HTTP] Настройка локального HTTP туннеля для авторизации...",
      "info",
    );
    const encUser = encodeURIComponent(proxyConfig.username);
    const encPass = encodeURIComponent(proxyConfig.password);
    const upstreamUrl = `http://${encUser}:${encPass}@${proxyConfig.ip}:${proxyConfig.port}`;

    this.server = new ProxyChain.Server({
      port: this.port,
      prepareRequestFunction: async ({ hostname, request }) => {
        const activeProxy = this.stateStore.getState().activeProxy;
        const currentRules = activeProxy?.rules || {
          mode: "global",
          whitelist: ["localhost", "127.0.0.1"],
          appWhitelist: [],
        };

        if (currentRules.appWhitelist && currentRules.appWhitelist.length > 0) {
          const clientPort =
            request.socket?.remotePort || request.connection?.remotePort;
          const appName = await this.systemAdapter.checkAppWhitelist(
            clientPort,
            currentRules.appWhitelist,
            hostname,
            this.logger.log.bind(this.logger),
          );
          if (appName) {
            return { requestAuthentication: false };
          }
        }

        const { isWhitelisted: isBypass, matchingRules } = isWhitelisted(
          hostname,
          currentRules.whitelist,
        );
        const isBlocked = BLOCKED_RESOURCES.some((d) => hostname.includes(d));

        let useProxy = false;
        let reason = "";

        if (currentRules.mode === "smart") {
          if (!isBypass && matchingRules.length > 0) {
            useProxy = true;
            reason = `Nested exception found: [${matchingRules.join(", ")}]`;
          } else if (isBypass) {
            useProxy = isBlocked;
            reason = isBlocked
              ? "Blocked resource in Smart mode"
              : "Bypass (Whitelisted)";
          } else {
            useProxy = isBlocked;
            reason = isBlocked
              ? "Blocked resource (No match)"
              : "Direct (Not blocked)";
          }
        } else {
          useProxy = !isBypass;
          reason = isBypass
            ? "Whitelisted (Bypass)"
            : "Not whitelisted (Proxy)";
        }

        if (!useProxy) {
          // Silent for bypasses to avoid log spam, but help debug if reasoning is complex
          if (matchingRules.length > 1) {
            this.logger.log(`[МОСТ] BYPASS: ${hostname} (${reason})`, "info");
          }
          return { requestAuthentication: false };
        }

        this.logger.log(
          `[ПРОКСИ] ${hostname} -> ${proxyConfig.ip} (${reason})`,
          "success",
        );

        return {
          requestAuthentication: false,
          upstreamProxyUrl: upstreamUrl,
        };
      },
    });

    this.server.on("serverError", () => {});
    await this.server.listen();

    return { host: this.host, port: this.port };
  }

  async stop() {
    if (this.server) {
      await this.server.close(true);
      this.server = null;
    }
  }
}

module.exports = HttpServer;
