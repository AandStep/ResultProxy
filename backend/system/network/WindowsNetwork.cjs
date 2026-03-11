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

class WindowsNetwork extends BaseNetworkManager {
  async getNetworkTraffic() {
    try {
      const { stdout } = await execFileAsync("netstat", ["-e"]);
      const lines = stdout.split("\n");
      for (let l of lines) {
        const parts = l.trim().split(/\s+/);
        if (parts.length >= 3) {
          const val1 = parseInt(parts[parts.length - 2], 10);
          const val2 = parseInt(parts[parts.length - 1], 10);
          if (!isNaN(val1) && !isNaN(val2)) {
            return { received: val1, sent: val2 };
          }
        }
      }
    } catch (e) {
      // Игнорируем ошибки (например, если нет прав или утилиты)
    }
    return { received: 0, sent: 0 };
  }
}

module.exports = WindowsNetwork;
