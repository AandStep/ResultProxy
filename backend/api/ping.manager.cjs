const net = require('net');

class PingManager {
    /**
     * Tests raw TCP connection latency to a host:port
     * Note: A true ping through the proxy requires the proxy to be running.
     * This is a simple TCP connect latency measure, which is often a good
     * proxy for generic server availability and delay.
     */
    async tcpPing(host, port, timeoutMs = 3000) {
        return new Promise((resolve) => {
            const startTime = process.hrtime();
            const socket = new net.Socket();

            const calculateDelay = () => {
                const diff = process.hrtime(startTime);
                return Math.round((diff[0] * 1e9 + diff[1]) / 1e6); // to ms
            };

            socket.setTimeout(timeoutMs);

            socket.on('connect', () => {
                const delay = calculateDelay();
                socket.destroy();
                resolve(delay);
            });

            socket.on('timeout', () => {
                socket.destroy();
                resolve(-1);
            });

            socket.on('error', () => {
                socket.destroy();
                resolve(-1);
            });

            socket.connect(port, host);
        });
    }

    /**
     * Ping multiple nodes at once
     */
    async pingNodes(nodes) {
        const promises = nodes.map(async node => {
            const delay = await this.tcpPing(node.address, node.port);
            return { id: node.id, delay };
        });
        return Promise.all(promises);
    }
}

module.exports = new PingManager();
