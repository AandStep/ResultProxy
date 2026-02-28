const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const loggerService = require('./logger.service.cjs');

class SingboxManager {
    constructor() {
        this.process = null;
        this.binaryPath = this.getBinaryPath();
        this.configPath = path.join(__dirname, 'singbox_config.json');
    }

    getBinaryPath() {
        const isWindows = process.platform === 'win32';
        // Use bundled binary path or fallback
        let basePath = path.join(__dirname, 'bin');
        if (process.env.NODE_ENV !== 'development' && process.resourcesPath) {
            basePath = path.join(process.resourcesPath, 'backend', 'core', 'bin');
        }
        const exeName = isWindows ? 'sing-box.exe' : 'sing-box';
        return path.join(basePath, exeName);
    }

    generateConfig(vlessNode, localPort = 10808) {
        // Generate valid Sing-box config.json for a VLESS node

        // Maps Xray's config to Sing-box outbounds
        const vlessOutbound = {
            type: "vless",
            tag: "proxy",
            server: vlessNode.address,
            server_port: parseInt(vlessNode.port, 10),
            uuid: vlessNode.userId,
            flow: vlessNode.flow || "",
            packet_encoding: "xudp"
        };

        // Network (Transport) mapping
        if (vlessNode.network === "ws") {
            vlessOutbound.transport = {
                type: "ws",
                path: vlessNode.path || "/",
                headers: vlessNode.host ? { "Host": vlessNode.host } : {}
            };
        } else if (vlessNode.network === "grpc") {
            vlessOutbound.transport = {
                type: "grpc",
                service_name: vlessNode.serviceName || ""
            };
        } else if (vlessNode.network === "xhttp" || vlessNode.network === "httpupgrade") {
            vlessOutbound.transport = {
                type: "httpupgrade",
                path: vlessNode.path || "/",
                headers: vlessNode.host ? { "Host": vlessNode.host } : {}
            };
        }

        // Security mapping
        if (vlessNode.security === "tls" || vlessNode.security === "reality") {
            vlessOutbound.tls = {
                enabled: true,
                server_name: vlessNode.sni || vlessNode.host || vlessNode.address,
                insecure: false,
                utls: {
                    enabled: true,
                    fingerprint: vlessNode.fp || "chrome"
                }
            };

            if (vlessNode.security === "reality") {
                vlessOutbound.tls.reality = {
                    enabled: true,
                    public_key: vlessNode.pbk,
                    short_id: vlessNode.sid || ""
                };
            }
        }

        const config = {
            log: {
                level: "warn",
                timestamp: true
            },
            inbounds: [
                {
                    type: "socks",
                    tag: "socks-in",
                    listen: "127.0.0.1",
                    listen_port: localPort,
                    sniff: true,
                    sniff_override_destination: true
                },
                {
                    type: "http",
                    tag: "http-in",
                    listen: "127.0.0.1",
                    listen_port: localPort + 1,
                    sniff: true,
                    sniff_override_destination: true
                }
            ],
            outbounds: [
                vlessOutbound,
                {
                    type: "direct",
                    tag: "direct"
                },
                {
                    type: "block",
                    tag: "block"
                }
            ],
            route: {
                rules: [
                    {
                        ip_is_private: true,
                        outbound: "direct"
                    },
                    {
                        geosite: ["category-ads-all"],
                        outbound: "block"
                    }
                ],
                final: "proxy",
                auto_detect_interface: true
            }
        };

        fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
        return this.configPath;
    }

    async start(vlessNode, localPort = 10808) {
        if (this.process) {
            await this.stop();
        }

        return new Promise((resolve, reject) => {
            if (!fs.existsSync(this.binaryPath)) {
                return reject(new Error(`Sing-box binary not found at ${this.binaryPath}`));
            }

            this.generateConfig(vlessNode, localPort);

            // sing-box uses 'run' command
            this.process = spawn(this.binaryPath, ['run', '-c', this.configPath], {
                windowsHide: true
            });

            this.process.stdout.on('data', (data) => {
                const output = data.toString();
                loggerService.log(`[Sing-box] ${output.trim()}`, 'info');
            });

            this.process.stderr.on('data', (data) => {
                let output = data.toString().trim();
                if (output.includes('ERROR') || output.includes('FATAL')) {
                    loggerService.log(`[Sing-box ERROR] ${output}`, 'error');
                } else {
                    loggerService.log(`[Sing-box] ${output}`, 'info');
                }
            });

            this.process.on('close', (code) => {
                loggerService.log(`[Sing-box] exited with code ${code}`, 'info');
                this.process = null;
            });

            this.process.on('error', (err) => {
                loggerService.log(`[Sing-box] Failed to start subprocess: ${err}`, 'error');
                reject(err);
            });

            // Resolve anyway after 2 seconds assuming it started if no error
            setTimeout(() => {
                if (this.process) {
                    resolve(true);
                } else {
                    reject(new Error('Sing-box process failed to start within timeout'));
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

module.exports = new SingboxManager();
