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
