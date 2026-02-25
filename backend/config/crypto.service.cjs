const os = require("os");
const crypto = require("crypto");
const { execSync } = require("child_process");

class CryptoService {
  constructor() {
    this.machineId = this.getHardwareId();
    this.encryptionKey = crypto
      .createHash("sha256")
      .update(this.machineId + "_ResultProxy_SafeVault_v1")
      .digest();
  }

  getHardwareId() {
    try {
      let id = "";
      const platform = os.platform();
      if (platform === "win32") {
        id = execSync(
          "reg query HKEY_LOCAL_MACHINE\\SOFTWARE\\Microsoft\\Cryptography /v MachineGuid",
          { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        );
      } else if (platform === "darwin") {
        id = execSync(
          "ioreg -rd1 -c IOPlatformExpertDevice | grep IOPlatformUUID",
          { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
        );
      } else {
        id = execSync("cat /etc/machine-id", {
          encoding: "utf8",
          stdio: ["ignore", "pipe", "ignore"],
        });
      }
      const match = id.match(/[a-fA-F0-9\-]{8,}/);
      return match ? match[0] : "fallback-hw-id-2024";
    } catch (e) {
      return "fallback-hw-id-2024";
    }
  }

  encrypt(data) {
    try {
      const iv = crypto.randomBytes(16);
      const cipher = crypto.createCipheriv(
        "aes-256-gcm",
        this.encryptionKey,
        iv,
      );
      let encrypted = cipher.update(JSON.stringify(data), "utf8", "base64");
      encrypted += cipher.final("base64");
      const authTag = cipher.getAuthTag();
      return JSON.stringify(
        {
          _isSecure: true,
          iv: iv.toString("base64"),
          data: encrypted,
          authTag: authTag.toString("base64"),
        },
        null,
        2,
      );
    } catch (e) {
      return JSON.stringify(data, null, 2);
    }
  }

  decrypt(rawStr) {
    try {
      const parsed = JSON.parse(rawStr);
      if (parsed._isSecure && parsed.data && parsed.iv && parsed.authTag) {
        const decipher = crypto.createDecipheriv(
          "aes-256-gcm",
          this.encryptionKey,
          Buffer.from(parsed.iv, "base64"),
        );
        decipher.setAuthTag(Buffer.from(parsed.authTag, "base64"));
        let decrypted = decipher.update(parsed.data, "base64", "utf8");
        decrypted += decipher.final("utf8");
        return JSON.parse(decrypted);
      }
      return parsed; // Fallback для старого формата
    } catch (e) {
      return null;
    }
  }
}

module.exports = new CryptoService();
