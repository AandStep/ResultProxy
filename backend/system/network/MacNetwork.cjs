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
const util = require("util");
const { execFile } = require("child_process");
const execFileAsync = util.promisify(execFile);

class MacNetwork extends BaseNetworkManager {
  async getNetworkTraffic() {
    try {
      const { stdout } = await execFileAsync("netstat", ["-ibn"]);
      let received = 0,
        sent = 0;
      const lines = stdout.split("\n");
      lines.forEach((line) => {
        if (line.startsWith("en")) {
          const parts = line.trim().split(/\s+/);
          if (parts[2] && parts[2].includes("Link#")) {
            received += parseInt(parts[6]) || 0;
            sent += parseInt(parts[9]) || 0;
          }
        }
      });
      return { received, sent };
    } catch (e) {
      return { received: 0, sent: 0 };
    }
  }
}

module.exports = MacNetwork;
