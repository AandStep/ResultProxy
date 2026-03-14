import { StateStore } from './StateStore';
import { LoggerService } from './LoggerService';
import net from 'net';

export class TrafficMonitor {
    private pingInterval: NodeJS.Timeout | null = null;
    private statsInterval: NodeJS.Timeout | null = null;

    constructor(
        private stateStore: StateStore,
        private logger: LoggerService
    ) {}

    public start(): void {
        this.startPingMonitoring();
        this.startTrafficMonitoring();
    }

    public stop(): void {
        if (this.pingInterval) clearInterval(this.pingInterval);
        if (this.statsInterval) clearInterval(this.statsInterval);
    }

    private startPingMonitoring(): void {
        this.pingInterval = setInterval(async () => {
            const state = this.stateStore.getState();
            if (state.isConnected && state.activeProxy) {
                const alive = await this.ping(state.activeProxy.ip, state.activeProxy.port);
                if (!alive && !state.isProxyDead) {
                    this.stateStore.setState({ isProxyDead: true });
                    this.logger.addLog(`Proxy ${state.activeProxy.ip} became unreachable`, 'error');
                } else if (alive && state.isProxyDead) {
                    this.stateStore.setState({ isProxyDead: false });
                    this.logger.addLog(`Proxy ${state.activeProxy.ip} is back online`, 'success');
                }
            }
        }, 3000);
    }

    private startTrafficMonitoring(): void {
        let lastBytesSent = 0;
        let lastBytesReceived = 0;

        this.statsInterval = setInterval(() => {
            const state = this.stateStore.getState();
            if (state.isConnected) {
                const rx = state.bytesReceived - lastBytesReceived;
                const tx = state.bytesSent - lastBytesSent;
                
                this.stateStore.setState({
                    speedReceived: Math.max(0, rx),
                    speedSent: Math.max(0, tx)
                });

                lastBytesReceived = state.bytesReceived;
                lastBytesSent = state.bytesSent;
            } else {
                lastBytesSent = 0;
                lastBytesReceived = 0;
            }
        }, 1000);
    }

    public async ping(host: string, port: number, timeout: number = 2000): Promise<boolean> {
        return new Promise((resolve) => {
            const socket = new net.Socket();
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
