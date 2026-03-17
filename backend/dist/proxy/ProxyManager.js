"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ProxyManager = void 0;
const ProxyChain = require('proxy-chain');
const net = require('net');
class ProxyManager {
    stateStore;
    logger;
    constructor(stateStore, logger) {
        this.stateStore = stateStore;
        this.logger = logger;
    }
    activeServer = null;
    bridgeServer = null;
    bridgePort = 14081;
    realProxyPort = 14082;
    bytesReceived = 0;
    bytesSent = 0;
    routingRules = { mode: 'global', whitelist: [] };
    async connect(proxy, rules, killSwitch) {
        this.logger.addLog(`Connecting to ${proxy.name} (${proxy.ip}:${proxy.port})...`);
        try {
            const self = this;
            if (this.activeServer)
                await this.activeServer.close(true);
            if (this.bridgeServer) {
                await new Promise((resolve) => {
                    this.bridgeServer.close(() => resolve());
                });
            }
            const proxyUrl = `http://${proxy.username}:${proxy.password}@${proxy.ip}:${proxy.port}`;
            this.routingRules = rules;
            this.bytesReceived = 0;
            this.bytesSent = 0;
            // 1. Start the actual proxy logic on realProxyPort
            this.activeServer = new ProxyChain.Server({
                port: this.realProxyPort,
                host: '127.0.0.1',
                prepareRequestFunction: ({ request, hostname, port }) => {
                    const mode = self.routingRules.mode || 'global';
                    const whitelist = self.routingRules.whitelist || [];
                    const isExclusion = whitelist.some((domain) => hostname.endsWith(domain.replace(/^\*\./, '')));
                    if (isExclusion) {
                        return { upstreamProxyUrl: null };
                    }
                    return { upstreamProxyUrl: proxyUrl };
                },
            });
            await new Promise((resolve, reject) => {
                this.activeServer.listen((err) => {
                    if (err)
                        reject(err);
                    else
                        resolve(true);
                });
            });
            // 2. Start the Transparent TCP Bridge on bridgePort for byte counting
            this.bridgeServer = net.createServer((clientSocket) => {
                console.log(`[DEBUG_BRIDGE] New connection to bridge`);
                const targetSocket = net.connect(self.realProxyPort, '127.0.0.1');
                clientSocket.on('data', (chunk) => {
                    self.bytesSent += chunk.length;
                    self.stateStore.setState({ bytesSent: self.bytesSent });
                    targetSocket.write(chunk);
                });
                targetSocket.on('data', (chunk) => {
                    self.bytesReceived += chunk.length;
                    self.stateStore.setState({ bytesReceived: self.bytesReceived });
                    clientSocket.write(chunk);
                });
                clientSocket.on('end', () => targetSocket.end());
                targetSocket.on('end', () => clientSocket.end());
                clientSocket.on('error', () => targetSocket.destroy());
                targetSocket.on('error', () => clientSocket.destroy());
            });
            await new Promise((resolve) => {
                this.bridgeServer.listen(this.bridgePort, '0.0.0.0', () => {
                    self.logger.addLog(`Traffic Bridge started on port ${self.bridgePort} -> ${self.realProxyPort}`, 'success');
                    resolve();
                });
            });
            this.stateStore.setState({
                isConnected: true,
                activeProxy: proxy,
                isProxyDead: false,
                bytesSent: 0,
                bytesReceived: 0
            });
            return { success: true, localProxyPort: this.bridgePort };
        }
        catch (error) {
            this.logger.addLog(`Failed to start proxy bridge: ${error.message}`, 'error');
            return { success: false, error: error.message };
        }
    }
    async disconnect() {
        this.logger.addLog('Disconnecting...');
        if (this.activeServer) {
            await this.activeServer.close(true);
            this.activeServer = null;
        }
        if (this.bridgeServer) {
            await new Promise((resolve) => {
                this.bridgeServer.close(() => resolve());
            });
            this.bridgeServer = null;
        }
        this.stateStore.setState({
            isConnected: false,
            activeProxy: null,
            isProxyDead: false
        });
        this.logger.addLog('Bridge stopped successfully', 'success');
    }
    async updateRules(rules) {
        this.routingRules = rules;
        this.logger.addLog(`Routing rules updated: mode=${rules.mode}, whitelist=${rules.whitelist.length}`, 'info');
    }
    getStats() {
        return {
            bytesSent: this.bytesSent,
            bytesReceived: this.bytesReceived
        };
    }
}
exports.ProxyManager = ProxyManager;
