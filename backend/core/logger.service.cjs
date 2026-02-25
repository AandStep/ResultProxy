class LoggerService {
  constructor() {
    this.logs = [];
    this.limit = 100;
  }

  log(msg, type = "info") {
    const time = new Date().toLocaleTimeString();
    this.logs.unshift({ timestamp: Date.now(), time, msg, type });
    if (this.logs.length > this.limit) {
      this.logs.pop();
    }
    console.log(`[${time}] ${msg}`);
  }

  getLogs() {
    return this.logs;
  }
}

module.exports = new LoggerService();
