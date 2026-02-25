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
