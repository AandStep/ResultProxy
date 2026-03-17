"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.StateStore = void 0;
const events_1 = require("events");
class StateStore extends events_1.EventEmitter {
    state = {
        isConnected: false,
        isProxyDead: false,
        activeProxy: null,
        bytesSent: 0,
        bytesReceived: 0,
        speedSent: 0,
        speedReceived: 0,
    };
    getState() {
        return { ...this.state };
    }
    setState(updates) {
        this.state = { ...this.state, ...updates };
        this.emit('change', this.state);
    }
    resetStats() {
        this.setState({
            bytesSent: 0,
            bytesReceived: 0,
            speedSent: 0,
            speedReceived: 0,
        });
    }
}
exports.StateStore = StateStore;
