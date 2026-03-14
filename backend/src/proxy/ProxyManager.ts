import { StateStore, ProxyItem } from '../core/StateStore';
import { LoggerService } from '../core/LoggerService';
const ProxyChain = require('proxy-chain');

export class ProxyManager {
    constructor(
        private stateStore: StateStore,
        private logger: LoggerService
    ) {}

    private activeServer: any = null;
    private bridgePort: number = 14081;
    private bytesReceived: number = 0;
    private bytesSent: number = 0;
    private routingRules: any = { mode: 'global', whitelist: [] };

    public async connect(proxy: ProxyItem, rules: any, killSwitch: boolean): Promise<any> {
        this.logger.addLog(`Connecting to ${proxy.name} (${proxy.ip}:${proxy.port})...`);
        
        try {
            if (this.activeServer) {
                await this.activeServer.close(true);
            }

            // Create an anonymized proxy bridge for authentication
            const proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}`;
            this.routingRules = rules;
            this.bytesReceived = 0;
            this.bytesSent = 0;

            this.activeServer = new ProxyChain.Server({
                port: this.bridgePort,
                host: '0.0.0.0',
                prepareRequestFunction: ({ request, hostname, port }: any) => {
                    const mode = this.routingRules.mode || 'global';
                    const whitelist = this.routingRules.whitelist || [];
                    
                    const isExclusion = whitelist.some((domain: string) => 
                        hostname.endsWith(domain.replace(/^\*\./, ''))
                    );

                    // Based on ru.json, domains in the list are EXCLUSIONS (go direct)
                    if (isExclusion) {
                        this.logger.addLog(`Direct connection to ${hostname} (in exclusions)`, 'info');
                        return {
                            upstreamProxyUrl: null
                        };
                    }

                    // In global or smart mode (if not excluded), go through proxy
                    return {
                        upstreamProxyUrl: proxyUrl,
                    };
                },
            });

            // Intercept traffic for byte counting
            this.activeServer.on('connection', ({ socket }: any) => {
                // Tracking data sent TO the proxy
                socket.on('data', (chunk: Buffer) => {
                    this.bytesSent += chunk.length;
                    this.stateStore.setState({ bytesSent: this.bytesSent });
                });

                // To track RECEIVED data, we can wrap the socket.write method 
                // as proxy-chain writes received data back to this socket
                const originalWrite = socket.write;
                socket.write = (...args: any[]) => {
                    const chunk = args[0];
                    if (Buffer.isBuffer(chunk)) {
                        this.bytesReceived += chunk.length;
                        this.stateStore.setState({ bytesReceived: this.bytesReceived });
                    }
                    return originalWrite.apply(socket, args);
                };
            });

            this.activeServer.on('requestFailed', ({ error }: any) => {
                this.logger.addLog(`Request failed: ${error.message}`, 'error');
            });

            await new Promise((resolve, reject) => {
                this.activeServer.listen((err: any) => {
                    if (err) reject(err);
                    else resolve(true);
                });
            });

            this.stateStore.setState({
                isConnected: true,
                activeProxy: proxy,
                isProxyDead: false,
                bytesSent: 0,
                bytesReceived: 0
            });

            this.logger.addLog(`Bridge started on port ${this.bridgePort}. Upstream: ${proxy.ip}`, 'success');
            return { success: true, localProxyPort: this.bridgePort };
        } catch (error: any) {
            this.logger.addLog(`Failed to start proxy bridge: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }

    public async disconnect(): Promise<void> {
        this.logger.addLog('Disconnecting...');
        if (this.activeServer) {
            await this.activeServer.close(true);
            this.activeServer = null;
        }
        this.stateStore.setState({
            isConnected: false,
            activeProxy: null,
            isProxyDead: false
        });
        this.logger.addLog('Bridge stopped successfully', 'success');
    }

    public async updateRules(rules: any): Promise<void> {
        this.routingRules = rules;
        this.logger.addLog(`Routing rules updated: mode=${rules.mode}, whitelist=${rules.whitelist.length}`, 'info');
    }

    public getStats() {
        return {
            bytesSent: this.bytesSent,
            bytesReceived: this.bytesReceived
        };
    }
}
