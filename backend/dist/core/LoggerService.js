"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggerService = void 0;
class LoggerService {
    logs = [];
    MAX_LOGS = 100;
    addLog(msg, type = 'info') {
        const now = new Date();
        const entry = {
            timestamp: now.getTime(),
            time: now.toLocaleTimeString(),
            msg,
            type,
        };
        this.logs.push(entry);
        if (this.logs.length > this.MAX_LOGS) {
            this.logs.shift();
        }
        console.log(`[${entry.time}] [${type.toUpperCase()}] ${msg}`);
    }
    getLogs() {
        return [...this.logs];
    }
}
exports.LoggerService = LoggerService;
