const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const loggerService = require('./logger.service.cjs');

class XrayManager {
    constructor() {
        this.process = null;
        this.binaryPath = this.getBinaryPath();
        this.configPath = path.join(__dirname, 'config.json');
    }

    getBinaryPath() {
        const isWindows = process.platform === 'win32';
        // Use bundled binary path or fallback
        let basePath = path.join(__dirname, 'bin');
        if (process.env.NODE_ENV !== 'development' && process.resourcesPath) {
            basePath = path.join(process.resourcesPath, 'backend', 'core', 'bin');
        }
        const exeName = isWindows ? 'xray.exe' : 'xray';
        return path.join(basePath, exeName);
    }

    generateConfig(vlessNode, localPort = 10808) {
        // Generate valid Xray config.json for a VLESS node
        const config = {
            log: {
                loglevel: 'warning' // 'debug' | 'info' | 'warning' | 'error' | 'none'
            },
            inbounds: [
                {
                    port: localPort,
                    listen: '127.0.0.1',
                    protocol: 'socks',
                    settings: {
                        udp: true,
                        auth: 'noauth'
                    },
                    sniffing: {
                        enabled: true,
                        destOverride: ['http', 'tls']
                    }
                },
                {
                    port: localPort + 1, // http proxy port
                    listen: '127.0.0.1',
                    protocol: 'http',
                    settings: {
                        allowTransparent: false
                    }
                }
            ],
            outbounds: [
                {
                    protocol: 'vless',
                    settings: {
                        vnext: [
                            {
                                address: vlessNode.address,
                                port: parseInt(vlessNode.port, 10),
                                users: [
                                    {
                                        id: vlessNode.userId,
                                        encryption: vlessNode.encryption || 'none',
                                        flow: vlessNode.flow || ''
                                    }
                                ]
                            }
                        ]
                    },
                    streamSettings: {
                        network: vlessNode.network === 'xhttp' ? 'splithttp' : (vlessNode.network || 'tcp'),
                        security: vlessNode.security || 'none',
                        tlsSettings: vlessNode.security === 'tls' ? {
                            serverName: vlessNode.sni || vlessNode.host || vlessNode.address,
                            allowInsecure: false,
                            fingerprint: vlessNode.fp || 'chrome'
                        } : undefined,
                        realitySettings: vlessNode.security === 'reality' ? {
                            serverName: vlessNode.sni || vlessNode.address,
                            publicKey: vlessNode.pbk,
                            shortId: vlessNode.sid || '',
                            spiderX: vlessNode.spx || '/',
                            fingerprint: vlessNode.fp || 'chrome'
                        } : undefined,
                        wsSettings: vlessNode.network === 'ws' ? {
                            path: vlessNode.path || '/',
                            headers: {
                                Host: vlessNode.host || vlessNode.address
                            }
                        } : undefined,
                        grpcSettings: vlessNode.network === 'grpc' ? {
                            serviceName: vlessNode.serviceName || '',
                            multiMode: vlessNode.mode === 'multi'
                        } : undefined,
                        splithttpSettings: vlessNode.network === 'xhttp' ? {
                            path: vlessNode.path || '/',
                            host: vlessNode.host || vlessNode.address
                        } : undefined
                    }
                },
                {
                    protocol: 'freedom',
                    tag: 'direct'
                },
                {
                    protocol: 'blackhole',
                    tag: 'block'
                }
            ],
            routing: {
                domainStrategy: 'IPIfNonMatch',
                rules: [
                    {
                        type: 'field',
                        ip: [
                            'geoip:private'
                        ],
                        outboundTag: 'direct'
                    },
                    {
                        type: 'field',
                        domain: [
                            'geosite:category-ads-all'
                        ],
                        outboundTag: 'block'
                    }
                ]
            }
        };

        // Clean up undefined fields
        if (config.outbounds[0].streamSettings.security === 'none') {
            delete config.outbounds[0].streamSettings.tlsSettings;
            delete config.outbounds[0].streamSettings.realitySettings;
        }

        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
        return this.configPath;
    }

    async start(vlessNode, localPort = 10808) {
        if (this.process) {
            await this.stop();
        }

        return new Promise((resolve, reject) => {
            if (!fs.existsSync(this.binaryPath)) {
                return reject(new Error(`Xray binary not found at ${this.binaryPath}`));
            }

            this.generateConfig(vlessNode, localPort);

            // We use -c to specify config
            this.process = spawn(this.binaryPath, ['-c', this.configPath], {
                windowsHide: true
            });

            this.process.stdout.on('data', (data) => {
                const output = data.toString();
                loggerService.log(`[Xray] ${output.trim()}`, 'info');
                if (output.includes('started')) {
                    resolve(true);
                }
            });

            this.process.stderr.on('data', (data) => {
                loggerService.log(`[Xray ERROR] ${data.toString().trim()}`, 'error');
            });

            this.process.on('close', (code) => {
                loggerService.log(`[Xray] exited with code ${code}`, 'info');
                this.process = null;
            });

            this.process.on('error', (err) => {
                loggerService.log(`[Xray] Failed to start subprocess: ${err}`, 'error');
                reject(err);
            });

            // Resolve anyway after 2 seconds assuming it started if no error
            setTimeout(() => {
                if (this.process) {
                    resolve(true);
                } else {
                    reject(new Error('Xray process failed to start within timeout'));
                }
            }, 2000);
        });
    }

    async stop() {
        return new Promise((resolve) => {
            if (this.process) {
                this.process.removeAllListeners('close');
                this.process.on('close', () => {
                    this.process = null;
                    resolve();
                });
                this.process.kill('SIGTERM');
            } else {
                resolve();
            }
        });
    }
}

module.exports = new XrayManager();
