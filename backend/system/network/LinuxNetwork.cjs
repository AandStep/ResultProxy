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

const BaseNetworkManager = require("../network/BaseNetworkManager.cjs");
const fs = require("fs");

class LinuxNetwork extends BaseNetworkManager {
  async getNetworkTraffic() {
    try {
      const data = fs.readFileSync("/proc/net/dev", "utf8");
      const lines = data.split("\n");
      let received = 0,
        sent = 0;

      for (let i = 2; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line || line.startsWith("lo:")) continue;

        const parts = line.split(/:?\s+/);
        if (parts.length >= 10) {
          received += parseInt(parts[1]) || 0;
          sent += parseInt(parts[9]) || 0;
        }
      }
      return { received, sent };
    } catch (e) {
      return { received: 0, sent: 0 };
    }
  }
}

module.exports = LinuxNetwork;
