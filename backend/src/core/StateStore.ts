import { EventEmitter } from 'events';

export interface ProxyItem {
    id: number;
    name: string;
    ip: string;
    port: number;
    type: 'http' | 'socks5' | 'https';
    username?: string;
    password?: string;
    country?: string;
}

export interface StateData {
    isConnected: boolean;
    isProxyDead: boolean;
    activeProxy: ProxyItem | null;
    bytesSent: number;
    bytesReceived: number;
    speedSent: number;
    speedReceived: number;
}

export class StateStore extends EventEmitter {
    private state: StateData = {
        isConnected: false,
        isProxyDead: false,
        activeProxy: null,
        bytesSent: 0,
        bytesReceived: 0,
        speedSent: 0,
        speedReceived: 0,
    };

    public getState(): StateData {
        return { ...this.state };
    }

    public setState(updates: Partial<StateData>): void {
        this.state = { ...this.state, ...updates };
        this.emit('change', this.state);
    }

    public resetStats(): void {
        this.setState({
            bytesSent: 0,
            bytesReceived: 0,
            speedSent: 0,
            speedReceived: 0,
        });
    }
}
