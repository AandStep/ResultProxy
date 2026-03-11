/*
 * Copyright (C) 2026 ResultProxy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

const { execFile, spawn } = require("child_process");
const util = require("util");
const execFileAsync = util.promisify(execFile);

class BaseProcessManager {
  constructor() {
    this.processTreeCache = {};
    this.isCaching = false;
    this.cacheInterval = null;
  }

  /**
   * Запускает фоновый интервал обновления кэша процессов (Шаблонный метод)
   */
  startProcessCacheInterval(getState) {
    if (this.cacheInterval) clearInterval(this.cacheInterval);

    this.cacheInterval = setInterval(async () => {
      if (this.isCaching) return;
      const state = getState();

      if (
        state.isConnected &&
        state.activeProxy?.rules?.appWhitelist?.length > 0
      ) {
        this.isCaching = true;
        try {
          const newCache = await this.fetchRawProcessList();
          if (newCache && Object.keys(newCache).length > 0) {
            this.processTreeCache = newCache;
          }
        } catch (error) {
          // Игнорируем ошибки кэширования в фоне
        } finally {
          this.isCaching = false;
        }
      }
    }, 5000);
  }

  stopProcessCacheInterval() {
    if (this.cacheInterval) {
      clearInterval(this.cacheInterval);
      this.cacheInterval = null;
    }
  }

  /**
   * Основной алгоритм проверки по белому списку (Шаблонный метод)
   */
  async checkAppWhitelist(remotePort, appWhitelist, targetHost, logCallback) {
    if (!appWhitelist || appWhitelist.length === 0 || !remotePort) return false;

    try {
      const pid = await this.getPidByPort(remotePort);
      if (!pid || isNaN(pid) || pid === "0") return false;

      let currentPid = pid;
      let foundAppName = false;
      let depth = 0;
      let chain = [];

      while (
        currentPid &&
        currentPid !== "0" &&
        currentPid !== "1" &&
        depth < 10
      ) {
        let info = this.processTreeCache[currentPid];
        if (!info) {
          info = await this.getProcessInfo(currentPid);
          if (info) this.processTreeCache[currentPid] = info;
        }
        if (!info) break;

        const normalizedName = this.normalizeProcessName(info.name);
        chain.push(normalizedName);

        const matchedApp = appWhitelist.find((app) => {
          const cleanApp = this.normalizeProcessName(app); // Нормализация имени из списка (убираем .exe)
          return (
            normalizedName === cleanApp || normalizedName.includes(cleanApp)
          );
        });

        if (matchedApp) {
          foundAppName = normalizedName;
          break;
        }
        currentPid = info.ppid;
        depth++;
      }

      const isSystemProcess = pid === "4" || pid === "0"; // 4 - System в Windows

      if (foundAppName) {
        if (logCallback) {
          logCallback(
            `[БЕЛЫЙ СПИСОК APP] Пропуск напрямую: ${targetHost} (Цепочка: ${chain.join(" <- ")})`,
            "warning",
          );
        }
      } else {
        const chainStr =
          chain.length > 0
            ? chain.join(" <- ")
            : `PID:${pid}${isSystemProcess ? " (Системный/Защищенный процесс)" : ""}`;
        if (logCallback) {
          logCallback(
            `[APP DEBUG] ${targetHost} (Процесс: ${chainStr}) не в белом списке. Идет в прокси.`,
            "info",
          );
        }
      }

      return foundAppName;
    } catch (error) {
      return false;
    }
  }

  /**
   * Абстрактные методы, которые должны реализовать классы-наследники
   */

  async fetchRawProcessList() {
    throw new Error("Method fetchRawProcessList must be implemented");
  }

  async getProcessInfo(pid) {
    throw new Error("Method getProcessInfo must be implemented");
  }

  async getPidByPort(remotePort) {
    throw new Error("Method getPidByPort must be implemented");
  }

  // Дефолтная реализация для Unix, Windows переопределит
  normalizeProcessName(name) {
    if (!name) return "";
    return name.toLowerCase().replace(".exe", "").trim();
  }
}

module.exports = BaseProcessManager;
