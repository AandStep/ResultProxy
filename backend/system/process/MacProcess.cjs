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

const BaseProcessManager = require("../process/BaseProcessManager.cjs");
const util = require("util");
const { execFile } = require("child_process");
const execFileAsync = util.promisify(execFile);

class MacProcess extends BaseProcessManager {
  async fetchRawProcessList() {
    try {
      const { stdout } = await execFileAsync("ps", ["-Ao", "pid=,ppid=,comm="]);
      const lines = stdout
        .split("\n")
        .map((l) => l.trim())
        .filter(Boolean);
      const newCache = {};
      lines.forEach((line) => {
        const match = line.match(/^(\d+)\s+(\d+)\s+(.+)$/);
        if (match) {
          const pid = match[1];
          const ppid = match[2];
          const comm = match[3];

          let name = comm.split("/").pop().toLowerCase();
          if (comm.includes(".app/")) {
            const appMatch = comm.match(/\/([^/]+)\.app\//);
            if (appMatch) name = appMatch[1].toLowerCase();
          }
          newCache[pid] = { name, ppid };
        }
      });
      return newCache;
    } catch (e) {
      return null;
    }
  }

  async getProcessInfo(pid) {
    try {
      const { stdout } = await execFileAsync("ps", [
        "-p",
        pid.toString(),
        "-o",
        "ppid=,comm=",
      ]);

      const match = stdout.trim().match(/^(\d+)\s+(.+)$/);
      if (match) {
        const ppid = match[1];
        const comm = match[2];
        const parts = comm.split("/");
        let name = parts[parts.length - 1].toLowerCase();

        if (comm.includes(".app/")) {
          const appMatch = comm.match(/\/([^/]+)\.app\//);
          if (appMatch) name = appMatch[1].toLowerCase();
        }
        return { name, ppid };
      }
    } catch (e) {}
    return null;
  }

  async getPidByPort(remotePort) {
    try {
      const { stdout } = await execFileAsync("lsof", [
        "-n",
        "-P",
        `-iTCP:${remotePort}`,
        "-sTCP:ESTABLISHED",
      ]);

      const lines = stdout.trim().split("\n");
      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        // Ищем строку, где искомый порт является локальным (слева от ->)
        if (line.includes(`:${remotePort}->`)) {
          const parts = line.split(/\s+/);
          return parts[1];
        }
      }
    } catch (error) {
      // Игнорируем ошибки lsof
    }
    return null;
  }
}

module.exports = MacProcess;
