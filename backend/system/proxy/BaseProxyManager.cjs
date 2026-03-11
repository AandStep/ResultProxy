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

class BaseProxyManager {
  constructor(loggerService) {
    this.loggerService = loggerService;
  }

  log(message, type = "info") {
    if (this.loggerService && typeof this.loggerService.log === "function") {
      this.loggerService.log(message, type);
    }
  }

  formatBypassList(whitelist) {
    throw new Error("Method formatBypassList must be implemented");
  }

  async setSystemProxy(proxyIp, proxyPort, proxyType, whitelist) {
    throw new Error("Method setSystemProxy must be implemented");
  }

  async disableSystemProxy() {
    throw new Error("Method disableSystemProxy must be implemented");
  }

  disableSystemProxySync() {
    throw new Error("Method disableSystemProxySync must be implemented");
  }

  async applyKillSwitch() {
    throw new Error("Method applyKillSwitch must be implemented");
  }

  async removeKillSwitchFirewall() {
    // По умолчанию ничего не делаем — переопределяется в наследниках
  }
}

module.exports = BaseProxyManager;
