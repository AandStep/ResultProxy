// ResultProxy Backend Server
import { StateStore, ProxyItem, StateData } from './core/StateStore';
import { AuthManager } from './core/AuthManager';
import { ConfigManager } from './core/ConfigManager';
import { LoggerService } from './core/LoggerService';
import { TrafficMonitor } from './core/TrafficMonitor';
import { ProxyManager } from './proxy/ProxyManager';
import { validateIp, detectCountryBackend } from './core/geo';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import path from 'path';
import os from 'os';

class ApiServer {
    private app = express();
    private port = 14091;

    constructor(
        private auth: AuthManager,
        private config: ConfigManager,
        private state: StateStore,
        private logger: LoggerService,
        private monitor: TrafficMonitor,
        private proxy: ProxyManager
    ) {
        this.setupMiddleware();
        this.setupRoutes();
    }

    private setupMiddleware() {
        this.app.use(cors());
        this.app.use(express.json());
    }

    private setupRoutes() {
        // Public Routes
        this.app.get('/api/status', (req, res) => {
            res.json(this.state.getState());
        });

        this.app.get('/api/platform', (req, res) => {
            res.json({ platform: os.platform() });
        });

        this.app.get('/api/version', (req, res) => {
            res.json({ version: '1.0.1-testing-auth' });
        });

        this.app.post('/api/detect-country', async (req, res) => {
            const { ip } = req.body;
            if (!ip) return res.json({ country: '🌐' });

            const cleanIp = ip.split(':')[0];

            if (!validateIp(cleanIp)) {
                return res.json({ country: '🌐' });
            }

            if (
                cleanIp === '127.0.0.1' ||
                cleanIp === 'localhost' ||
                cleanIp.startsWith('192.168.') ||
                cleanIp.startsWith('10.')
            ) {
                return res.json({ country: '🏠' });
            }

            const country = await detectCountryBackend(cleanIp);
            res.json({ country: country || '🌐' });
        });

        // Auth Middleware (for private routes)
        this.app.use((req: Request, res: Response, next: NextFunction) => {
            const authHeader = req.headers.authorization;
            if (this.auth.verifyToken(authHeader)) {
                next();
            } else {
                res.status(401).json({ error: 'Unauthorized' });
            }
        });

        // Private Routes
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
    }

    public start() {
        this.app.listen(this.port, '0.0.0.0', () => {
             this.logger.addLog(`API Server started on port ${this.port}`, 'success');
         });
    }
}

// Bootstrap
const userData = path.join(os.homedir(), '.resultProxy');
const auth = new AuthManager();
const logger = new LoggerService();
const config = new ConfigManager(userData);
const state = new StateStore();
const monitor = new TrafficMonitor(state, logger);
const proxy = new ProxyManager(state, logger);

const server = new ApiServer(auth, config, state, logger, monitor, proxy);

monitor.start();
server.start();
