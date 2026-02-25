const BaseProxyManager = require("./BaseProxyManager.cjs");
const util = require("util");
const { execFile, execSync } = require("child_process");
const execFileAsync = util.promisify(execFile);

class WindowsProxy extends BaseProxyManager {
  formatBypassList(whitelist) {
    let override = "<local>";
    if (whitelist && whitelist.length > 0) {
      const bypassStr = whitelist.map((d) => `*.${d};*${d}*`).join(";");
      override = `${bypassStr};<local>`;
    }
    return override;
  }

  async setSystemProxy(proxyIp, proxyPort, proxyType, whitelist) {
    let proxyStr = "";
    if (proxyType === "SOCKS5") {
      proxyStr = `socks=${proxyIp}:${proxyPort}`;
    } else if (proxyType === "ALL") {
      proxyStr = `${proxyIp}:${proxyPort}`;
    } else {
      proxyStr = `http=${proxyIp}:${proxyPort};https=${proxyIp}:${proxyPort}`;
    }

    const override = this.formatBypassList(whitelist);

    try {
      // Использование reg.exe напрямую вместо exec con concatenation
      await execFileAsync("reg", [
        "add",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyEnable",
        "/t",
        "REG_DWORD",
        "/d",
        "1",
        "/f",
      ]);
      await execFileAsync("reg", [
        "add",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyServer",
        "/t",
        "REG_SZ",
        "/d",
        proxyStr,
        "/f",
      ]);
      await execFileAsync("reg", [
        "add",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyOverride",
        "/t",
        "REG_SZ",
        "/d",
        override,
        "/f",
      ]);
      try {
        await execFileAsync("reg", [
          "delete",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
          "/v",
          "AutoConfigURL",
          "/f",
        ]);
      } catch (e) {} // Игнорируем, если ключа нет
      await execFileAsync("ipconfig", ["/flushdns"]);

      this.log(`[СИСТЕМА] Прокси применен к Windows успешно.`, "success");
    } catch (error) {
      this.log(
        `[ОШИБКА СИСТЕМЫ] Ошибка установки прокси: ${error.message}`,
        "error",
      );
      throw error;
    }
  }

  async disableSystemProxy() {
    this.log("[СИСТЕМА] Очистка настроек прокси из реестра Windows...", "info");
    try {
      await execFileAsync("reg", [
        "add",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyEnable",
        "/t",
        "REG_DWORD",
        "/d",
        "0",
        "/f",
      ]);
      try {
        await execFileAsync("reg", [
          "delete",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
          "/v",
          "ProxyServer",
          "/f",
        ]);
      } catch (e) {}
      try {
        await execFileAsync("reg", [
          "delete",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
          "/v",
          "ProxyOverride",
          "/f",
        ]);
      } catch (e) {}
      try {
        await execFileAsync("reg", [
          "delete",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
          "/v",
          "AutoConfigURL",
          "/f",
        ]);
      } catch (e) {}
      await execFileAsync("ipconfig", ["/flushdns"]);
    } catch (error) {
      this.log(
        `[ОШИБКА СИСТЕМЫ] Ошибка очистки прокси: ${error.message}`,
        "error",
      );
    }
  }

  disableSystemProxySync() {
    try {
      execSync(
        'reg add "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyEnable /t REG_DWORD /d 0 /f',
        { stdio: "ignore" },
      );
      execSync(
        'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyServer /f',
        { stdio: "ignore" },
      );
      execSync(
        'reg delete "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings" /v ProxyOverride /f',
        { stdio: "ignore" },
      );
    } catch (e) {
      // Игнорируем ошибки при синхронном закрытии
    }
  }

  async applyKillSwitch() {
    this.log(
      "[KILL SWITCH] Активирована полная блокировка интернета!",
      "error",
    );
    try {
      await execFileAsync("reg", [
        "add",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyEnable",
        "/t",
        "REG_DWORD",
        "/d",
        "1",
        "/f",
      ]);
      await execFileAsync("reg", [
        "add",
        "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
        "/v",
        "ProxyServer",
        "/t",
        "REG_SZ",
        "/d",
        "127.0.0.1:65535",
        "/f",
      ]);
      try {
        await execFileAsync("reg", [
          "delete",
          "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Internet Settings",
          "/v",
          "ProxyOverride",
          "/f",
        ]);
      } catch (e) {}
      await execFileAsync("ipconfig", ["/flushdns"]);
    } catch (error) {
      this.log(`[ОШИБКА KILL SWITCH] ${error.message}`, "error");
    }
  }
}

module.exports = WindowsProxy;
