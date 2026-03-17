"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const StateStore_1 = require("./core/StateStore");
const AuthManager_1 = require("./core/AuthManager");
const ConfigManager_1 = require("./core/ConfigManager");
const LoggerService_1 = require("./core/LoggerService");
const TrafficMonitor_1 = require("./core/TrafficMonitor");
const ProxyManager_1 = require("./proxy/ProxyManager");
const geo_1 = require("./core/geo");
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const path_1 = __importDefault(require("path"));
const os_1 = __importDefault(require("os"));
class ApiServer {
    auth;
    config;
    state;
    logger;
    monitor;
    proxy;
    app = (0, express_1.default)();
    port = 14090;
    constructor(auth, config, state, logger, monitor, proxy) {
        this.auth = auth;
        this.config = config;
        this.state = state;
        this.logger = logger;
        this.monitor = monitor;
        this.proxy = proxy;
        this.setupMiddleware();
        this.setupRoutes();
    }
    setupMiddleware() {
        this.app.use((0, cors_1.default)());
        this.app.use(express_1.default.json());
        // Auth Middleware
        this.app.use((req, res, next) => {
            if (req.path === '/api/platform' || req.path === '/api/version' || req.path === '/api/status')
                return next();
            const authHeader = req.headers.authorization;
            if (this.auth.verifyToken(authHeader)) {
                next();
            }
            else {
                res.status(401).json({ error: 'Unauthorized' });
            }
        });
    }
    setupRoutes() {
        this.app.get('/api/status', (req, res) => {
            res.json(this.state.getState());
        });
        this.app.get('/api/logs', (req, res) => {
            res.json(this.logger.getLogs());
        });
        this.app.get('/api/config', async (req, res) => {
            res.json(await this.config.load());
        });
        this.app.post('/api/config', async (req, res) => {
            await this.config.save(req.body);
            res.json({ success: true });
        });
        this.app.post('/api/connect', async (req, res) => {
            const result = await this.proxy.connect(req.body, req.body.rules, req.body.killSwitch);
            res.json(result);
        });
        this.app.post('/api/disconnect', async (req, res) => {
            await this.proxy.disconnect();
            res.json({ success: true });
        });
        this.app.post('/api/ping', async (req, res) => {
            const { ip, port } = req.body;
            const start = Date.now();
            const alive = await this.monitor.ping(ip, port);
            const ping = Date.now() - start;
            res.json({ alive, ping });
        });
        this.app.get('/api/platform', (req, res) => {
            res.json({ platform: os_1.default.platform() });
        });
        this.app.post('/api/detect-country', async (req, res) => {
            const { ip } = req.body;
            if (!ip)
                return res.json({ country: '🌐' });
            const cleanIp = ip.split(':')[0];
            if (!(0, geo_1.validateIp)(cleanIp)) {
                return res.json({ country: '🌐' });
            }
            if (cleanIp === '127.0.0.1' ||
                cleanIp === 'localhost' ||
                cleanIp.startsWith('192.168.') ||
                cleanIp.startsWith('10.')) {
                return res.json({ country: '🏠' });
            }
            const country = await (0, geo_1.detectCountryBackend)(cleanIp);
            res.json({ country: country || '🌐' });
        });
        this.app.get('/api/version', (req, res) => {
            res.json({ version: '1.0.0-backend' });
        });
    }
    start() {
        this.app.listen(this.port, '0.0.0.0', () => {
            this.logger.addLog(`API Server started on port ${this.port}`, 'success');
        });
    }
}
// Bootstrap
const userData = path_1.default.join(os_1.default.homedir(), '.resultProxy');
const auth = new AuthManager_1.AuthManager();
const logger = new LoggerService_1.LoggerService();
const config = new ConfigManager_1.ConfigManager(userData);
const state = new StateStore_1.StateStore();
const monitor = new TrafficMonitor_1.TrafficMonitor(state, logger);
const proxy = new ProxyManager_1.ProxyManager(state, logger);
const server = new ApiServer(auth, config, state, logger, monitor, proxy);
monitor.start();
server.start();
