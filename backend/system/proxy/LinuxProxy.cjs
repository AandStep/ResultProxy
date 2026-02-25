const BaseProxyManager = require("./BaseProxyManager.cjs");
const util = require("util");
const { execFile, execSync } = require("child_process");
const execFileAsync = util.promisify(execFile);

class LinuxProxy extends BaseProxyManager {
  formatBypassList(whitelist) {
    let bypassArray = ["'localhost'", "'127.0.0.0/8'", "'::1'"];
    if (whitelist && whitelist.length > 0) {
      whitelist.forEach((domain) => {
        const clean = domain.replace(/\*/g, "");
        bypassArray.push(`'${clean}'`);
      });
    }
    return `[${bypassArray.join(", ")}]`;
  }

  async setSystemProxy(proxyIp, proxyPort, proxyType, whitelist) {
    const bypassStr = this.formatBypassList(whitelist);

    try {
      await execFileAsync("gsettings", [
        "set",
        "org.gnome.system.proxy",
        "mode",
        "'manual'",
      ]);
      await execFileAsync("gsettings", [
        "set",
        "org.gnome.system.proxy",
        "ignore-hosts",
        bypassStr,
      ]);

      if (proxyType === "SOCKS5") {
        await execFileAsync("gsettings", [
          "set",
          "org.gnome.system.proxy.socks",
          "host",
          `'${proxyIp}'`,
        ]);
        await execFileAsync("gsettings", [
          "set",
          "org.gnome.system.proxy.socks",
          "port",
          proxyPort.toString(),
        ]);
        await execFileAsync("gsettings", [
          "set",
          "org.gnome.system.proxy.http",
          "host",
          "''",
        ]);
        await execFileAsync("gsettings", [
          "set",
          "org.gnome.system.proxy.https",
          "host",
          "''",
        ]);
      } else {
        await execFileAsync("gsettings", [
          "set",
          "org.gnome.system.proxy.http",
          "host",
          `'${proxyIp}'`,
        ]);
        await execFileAsync("gsettings", [
          "set",
          "org.gnome.system.proxy.http",
          "port",
          proxyPort.toString(),
        ]);
        await execFileAsync("gsettings", [
          "set",
          "org.gnome.system.proxy.https",
          "host",
          `'${proxyIp}'`,
        ]);
        await execFileAsync("gsettings", [
          "set",
          "org.gnome.system.proxy.https",
          "port",
          proxyPort.toString(),
        ]);

        if (proxyType === "ALL") {
          await execFileAsync("gsettings", [
            "set",
            "org.gnome.system.proxy.socks",
            "host",
            `'${proxyIp}'`,
          ]);
          await execFileAsync("gsettings", [
            "set",
            "org.gnome.system.proxy.socks",
            "port",
            proxyPort.toString(),
          ]);
        } else {
          await execFileAsync("gsettings", [
            "set",
            "org.gnome.system.proxy.socks",
            "host",
            "''",
          ]);
        }
      }

      this.log(`[СИСТЕМА] Прокси применен к Linux (gsettings).`, "success");
    } catch (error) {
      // Игнорируем ошибки gsettings (может быть KDE/иная среда), но логируем на уровне инфо
      this.log(
        `[СИСТЕМА Linux] Ошибка настройки gsettings: ${error.message} (возможно не GNOME среда)`,
        "info",
      );
    }
  }

  async disableSystemProxy() {
    this.log("[СИСТЕМА] Очистка настроек прокси Linux...", "info");
    try {
      await execFileAsync("gsettings", [
        "set",
        "org.gnome.system.proxy",
        "mode",
        "'none'",
      ]);
    } catch (error) {
      this.log(
        `[СИСТЕМА Linux] Ошибка сброса gsettings: ${error.message}`,
        "info",
      );
    }
  }

  disableSystemProxySync() {
    try {
      execSync(`gsettings set org.gnome.system.proxy mode 'none'`, {
        stdio: "ignore",
      });
    } catch (e) {
      // Игнорируем ошибку
    }
  }

  async applyKillSwitch() {
    this.log(
      "[KILL SWITCH] Активирована полная блокировка интернета!",
      "error",
    );
    try {
      await execFileAsync("gsettings", [
        "set",
        "org.gnome.system.proxy",
        "mode",
        "'manual'",
      ]);
      await execFileAsync("gsettings", [
        "set",
        "org.gnome.system.proxy.socks",
        "host",
        "'127.0.0.1'",
      ]);
      await execFileAsync("gsettings", [
        "set",
        "org.gnome.system.proxy.socks",
        "port",
        "65535",
      ]);
      await execFileAsync("gsettings", [
        "set",
        "org.gnome.system.proxy.http",
        "host",
        "'127.0.0.1'",
      ]);
      await execFileAsync("gsettings", [
        "set",
        "org.gnome.system.proxy.http",
        "port",
        "65535",
      ]);
    } catch (error) {
      this.log(
        `[СИСТЕМА Linux] Ошибка kill-switch (gsettings): ${error.message}`,
        "info",
      );
    }
  }
}

module.exports = LinuxProxy;
