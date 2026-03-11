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

const fs = require("fs");
const path = require("path");
const cryptoService = require("./crypto.service.cjs");

class ConfigManager {
  constructor() {
    this.configPath = null;
    this.configCache = null;
  }

  init(userDataPath) {
    this.configPath = path.join(userDataPath, "proxy_config.json");
    this.load();
  }

  load() {
    if (!this.configPath) return null;

    try {
      if (fs.existsSync(this.configPath)) {
        const raw = fs.readFileSync(this.configPath, "utf8");
        this.configCache = cryptoService.decrypt(raw);
      }
    } catch (e) {
      console.error("Config load error:", e.message);
    }

    if (!this.configCache) {
      this.configCache = {
        routingRules: {
          mode: "global",
          whitelist: ["localhost", "127.0.0.1"],
          appWhitelist: [],
        },
      };
    } else if (this.configCache.routingRules) {
      if (!this.configCache.routingRules.whitelist) {
        this.configCache.routingRules.whitelist = ["localhost", "127.0.0.1"];
      }
      if (!this.configCache.routingRules.appWhitelist) {
        this.configCache.routingRules.appWhitelist = [];
      }
    }

    return this.configCache;
  }

  save(data) {
    if (!this.configPath) throw new Error("ConfigManager not initialized");

    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const encrypted = cryptoService.encrypt(data);
      fs.writeFileSync(this.configPath, encrypted);
      this.configCache = data;
      return true;
    } catch (e) {
      console.error("Config save error:", e.message);
      throw e;
    }
  }

  getConfig() {
    return this.configCache || this.load();
  }
}

module.exports = new ConfigManager();
