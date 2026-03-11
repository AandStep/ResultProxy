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
const { execFile, exec } = require("child_process");
const execFileAsync = util.promisify(execFile);
const execAsync = util.promisify(exec);

class WindowsProcess extends BaseProcessManager {
  normalizeProcessName(name) {
    if (!name) return "";
    return name.toLowerCase().trim();
  }

  async fetchRawProcessList() {
    try {
      const { stdout } = await execFileAsync(
        "wmic",
        ["process", "get", "Name,ParentProcessId,ProcessId"],
        { maxBuffer: 1024 * 1024 * 50 },
      );

      const lines = stdout
        .split("\n")
        .map((l) => l.replace(/\r/g, "").trim())
        .filter((l) => l.length > 0);

      const newCache = {};
      for (let i = 1; i < lines.length; i++) {
        const match = lines[i].match(/(.+?)\s+(\d+)\s+(\d+)$/);
        if (match) {
          newCache[match[3]] = {
            name: this.normalizeProcessName(match[1]),
            ppid: match[2],
          };
        }
      }
      return newCache;
    } catch (e) {
      return null;
    }
  }

  async getProcessInfo(pid) {
    try {
      const { stdout } = await execFileAsync(
        "wmic",
        ["process", "where", `processid=${pid}`, "get", "Name,ParentProcessId"],
        { maxBuffer: 1024 * 1024 * 50 },
      );

      const lines = stdout
        .split("\n")
        .map((l) => l.replace(/\r/g, "").trim())
        .filter((l) => l.length > 0);

      if (lines.length >= 2) {
        const match = lines[1].match(/^(.+?)\s+(\d+)$/);
        if (match) {
          return {
            name: this.normalizeProcessName(match[1]),
            ppid: match[2],
          };
        }
      }
    } catch (e) {
      // Fallback на tasklist
      try {
        const { stdout: out2 } = await execFileAsync(
          "tasklist",
          ["/fi", `PID eq ${pid}`, "/fo", "csv", "/nh"],
          { maxBuffer: 1024 * 1024 * 50 },
        );

        if (out2 && out2.includes(pid.toString())) {
          const match = out2.match(/"([^"]+)"/);
          if (match) {
            return { name: this.normalizeProcessName(match[1]), ppid: "0" };
          }
        }
      } catch (err2) {}
    }
    return null;
  }

  async getPidByPort(remotePort) {
    try {
      const { stdout } = await execAsync(
        `netstat -ano | findstr ":${remotePort}"`,
        { maxBuffer: 1024 * 1024 * 50 },
      );

      const lines = stdout.trim().split(/\r?\n/);
      let pid = null;
      for (let line of lines) {
        const parts = line.trim().split(/\s+/).filter(Boolean);
        if (parts.length >= 4) {
          let currentPid = parts[parts.length - 1];
          let localAddr = parts[1];
          // Ищем совпадение только по локальному порту, так как remotePort это исходящий порт приложения
          if (localAddr.endsWith(`:${remotePort}`)) {
            pid = currentPid;
            break;
          }
        }
      }
      return pid;
    } catch (error) {
      return null;
    }
  }
}

module.exports = WindowsProcess;
