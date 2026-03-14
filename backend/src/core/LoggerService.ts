export interface LogEntry {
    timestamp: number;
    time: string;
    msg: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

export class LoggerService {
    private logs: LogEntry[] = [];
    private readonly MAX_LOGS = 100;

    public addLog(msg: string, type: LogEntry['type'] = 'info'): void {
        const now = new Date();
        const entry: LogEntry = {
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

    public getLogs(): LogEntry[] {
        return [...this.logs];
    }
}
