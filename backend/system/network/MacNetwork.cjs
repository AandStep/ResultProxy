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
