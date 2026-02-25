const BaseProcessManager = require("../process/BaseProcessManager.cjs");
const util = require("util");
const { execFile } = require("child_process");
const execFileAsync = util.promisify(execFile);

class LinuxProcess extends BaseProcessManager {
  async fetchRawProcessList() {
    try {
      const { stdout } = await execFileAsync("ps", ["-eo", "pid=,ppid=,comm="]);
      const lines = stdout.split("\n").filter(Boolean);
      const newCache = {};
      lines.forEach((line) => {
        const parts = line.trim().split(/\s+/);
        if (parts.length >= 3) {
          const pid = parts[0];
          const ppid = parts[1];
          const name = parts.slice(2).join(" ").split("/").pop().toLowerCase();
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

      const parts = stdout.trim().split(/\s+/);
      if (parts.length >= 2) {
        const ppid = parts[0];
        const name = parts.slice(1).join(" ").split("/").pop().toLowerCase();
        return { name, ppid };
      }
    } catch (e) {}
    return null;
  }

  async getPidByPort(remotePort) {
    try {
      const { stdout } = await execFileAsync("lsof", [
        "-nP",
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
      // Если процесс не найден, или нет прав, lsof вернет не 0 код возврата
    }
    return null;
  }
}

module.exports = LinuxProcess;
