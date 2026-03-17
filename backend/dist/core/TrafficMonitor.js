"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrafficMonitor = void 0;
const net_1 = __importDefault(require("net"));
class TrafficMonitor {
    stateStore;
    logger;
    pingInterval = null;
    statsInterval = null;
    constructor(stateStore, logger) {
        this.stateStore = stateStore;
        this.logger = logger;
    }
    start() {
        this.startPingMonitoring();
        this.startTrafficMonitoring();
    }
    stop() {
        if (this.pingInterval)
            clearInterval(this.pingInterval);
        if (this.statsInterval)
            clearInterval(this.statsInterval);
    }
    startPingMonitoring() {
        let failureCount = 0;
        const FAILURE_THRESHOLD = 3;
        this.pingInterval = setInterval(async () => {
            const state = this.stateStore.getState();
            if (state.isConnected && state.activeProxy) {
                const alive = await this.ping(state.activeProxy.ip, state.activeProxy.port);
                if (alive) {
                    failureCount = 0;
                    if (state.isProxyDead) {
                        this.stateStore.setState({ isProxyDead: false });
                        this.logger.addLog(`Proxy ${state.activeProxy.ip} is back online`, 'success');
                    }
                }
                else {
                    failureCount++;
                    if (failureCount >= FAILURE_THRESHOLD && !state.isProxyDead) {
                        this.stateStore.setState({ isProxyDead: true });
                        this.logger.addLog(`Proxy ${state.activeProxy.ip} became unreachable`, 'error');
                    }
                }
            }
        }, 3000);
    }
    startTrafficMonitoring() {
        let lastBytesSent = 0;
        let lastBytesReceived = 0;
        this.statsInterval = setInterval(() => {
            const state = this.stateStore.getState();
            if (state.isConnected) {
                const rx = state.bytesReceived - lastBytesReceived;
                const tx = state.bytesSent - lastBytesSent;
                if (rx > 0 || tx > 0) {
                    // this.logger.addLog(`Traffic update: rx=${rx}, tx=${tx}`, 'info');
                }
                this.stateStore.setState({
                    speedReceived: Math.max(0, rx),
                    speedSent: Math.max(0, tx)
                });
                lastBytesReceived = state.bytesReceived;
                lastBytesSent = state.bytesSent;
            }
            else {
                lastBytesSent = 0;
                lastBytesReceived = 0;
            }
        }, 1000);
    }
    async ping(host, port, timeout = 2000) {
        return new Promise((resolve) => {
            const socket = new net_1.default.Socket();
            socket.setTimeout(timeout);
            socket.on('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.on('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.on('error', () => {
                socket.destroy();
                resolve(false);
            });
            socket.connect(port, host);
        });
    }
}
exports.TrafficMonitor = TrafficMonitor;
