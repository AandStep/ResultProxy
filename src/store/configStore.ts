import { create } from 'zustand';
import { persist, createJSONStorage, StateStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18next from 'i18next';
import { apiFetch } from '../services/api';
import { detectCountry } from '../utils/network';
import { cryptoService } from '../utils/crypto';

export type ProxyItem = {
    id: number;
    name: string;
    ip: string;
    port: string;
    type: string;
    username?: string;
    password?: string;
    country: string;
};

export type RoutingRules = {
    mode: 'global' | 'smart';
    whitelist: string[];
    appWhitelist: string[];
};

export type AppSettings = {
    autostart: boolean;
    killswitch: boolean;
    adblock: boolean;
};

type ConfigStore = {
    isConfigLoaded: boolean;
    proxies: ProxyItem[];
    routingRules: RoutingRules;
    settings: AppSettings;
    editingProxy: ProxyItem | null;
    platform: string;

    setProxies: (p: ProxyItem[]) => void;
    setRoutingRules: (r: RoutingRules) => void;
    setSettings: (s: AppSettings) => void;
    setEditingProxy: (p: ProxyItem | null) => void;
    loadConfig: (addLog: (msg: string, type: string) => void) => Promise<void>;
    syncConfig: () => Promise<void>;
    syncRules: () => Promise<void>;
    syncProxies: () => Promise<void>;
    updateSetting: (key: string, value: boolean) => void;
    handleSaveProxy: (
        proxyData: Partial<ProxyItem>,
        activeProxy: ProxyItem | null,
        failedProxy: ProxyItem | null,
        setFailedProxy: (p: ProxyItem | null) => void,
        setActiveProxy: (p: ProxyItem | null) => void,
        isConnected: boolean,
        selectAndConnect: (proxy: ProxyItem, force?: boolean) => Promise<void>,
        addLog: (msg: string, type: string) => void,
    ) => Promise<void>;
    handleBulkSaveProxies: (
        proxies: any[],
        protocol: string,
        addLog: (msg: string, type: string) => void,
    ) => Promise<void>;
};

const encryptedStorage: StateStorage = {
    getItem: async (name: string): Promise<string | null> => {
        await cryptoService.init();
        const value = await AsyncStorage.getItem(name);
        if (!value) return null;
        try {
            const decrypted = cryptoService.decrypt(value);
            return JSON.stringify(decrypted);
        } catch (e) {
            return value; // Fallback for plain text
        }
    },
    setItem: async (name: string, value: string): Promise<void> => {
        await cryptoService.init();
        try {
            const parsed = JSON.parse(value);
            const encrypted = cryptoService.encrypt(parsed);
            await AsyncStorage.setItem(name, encrypted);
        } catch (e) {
            await AsyncStorage.setItem(name, value);
        }
    },
    removeItem: async (name: string): Promise<void> => {
        await AsyncStorage.removeItem(name);
    },
};

export const useConfigStore = create<ConfigStore>()(
    persist(
        (set, get) => ({
            isConfigLoaded: false,
            proxies: [],
            routingRules: {
                mode: 'global',
                whitelist: ['localhost', '127.0.0.1'],
                appWhitelist: [],
            },
            settings: { autostart: false, killswitch: false, adblock: false },
            editingProxy: null,
            platform: 'android',

            setProxies: proxies => {
                set({ proxies });
                get().syncProxies();
                get().syncConfig();
            },
            setRoutingRules: routingRules => {
                set({ routingRules });
                get().syncRules();
                get().syncConfig();
            },
            setSettings: settings => {
                set({ settings });
                get().syncConfig();
            },
            setEditingProxy: editingProxy => set({ editingProxy }),

            loadConfig: async addLog => {
                try {
                    const res = await apiFetch('/api/config');
                    const data = await res.json();
                    if (data.proxies && data.proxies.length > 0) {
                        set({ proxies: data.proxies });
                        
                        // Async re-detection for unknown countries
                        setTimeout(async () => {
                            const currentProxies = get().proxies;
                            let changed = false;
                            const updated = await Promise.all(currentProxies.map(async p => {
                                if (!p.country || p.country === 'unknown' || p.country === '🌐') {
                                    const c = await detectCountry(p.ip);
                                    if (c !== p.country) {
                                        changed = true;
                                        return { ...p, country: c };
                                    }
                                }
                                return p;
                            }));
                            if (changed) {
                                set({ proxies: updated });
                                get().syncConfig();
                                get().syncProxies();
                            }
                        }, 1000);
                    }
                    if (data.routingRules && Object.keys(data.routingRules).length > 0) {
                        const validatedRules = {
                            mode: data.routingRules.mode || 'global',
                            whitelist: Array.isArray(data.routingRules.whitelist) ? data.routingRules.whitelist : [],
                            appWhitelist: Array.isArray(data.routingRules.appWhitelist) ? data.routingRules.appWhitelist : [],
                        };
                        set({ routingRules: validatedRules });
                    }
                    if (data.settings && Object.keys(data.settings).length > 0) set({ settings: data.settings });
                    set({ isConfigLoaded: true });
                    addLog('Конфигурация успешно загружена.', 'success');
                } catch {
                    set({ isConfigLoaded: true });
                    addLog('Служба недоступна. Используются базовые настройки.', 'error');
                }
            },

            syncConfig: async () => {
                const { proxies, routingRules, settings, isConfigLoaded } = get();
                if (!isConfigLoaded) return;
                apiFetch('/api/config', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ proxies, routingRules, settings }),
                }).catch(() => { });
            },

            syncRules: async () => {
                const { routingRules, isConfigLoaded } = get();
                if (!isConfigLoaded) return;
                apiFetch('/api/update-rules', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(routingRules),
                }).catch(() => { });
            },

            syncProxies: async () => {
                const { proxies, isConfigLoaded } = get();
                if (!isConfigLoaded) return;
                apiFetch('/api/sync-proxies', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(proxies),
                }).catch(() => { });
            },

            updateSetting: (key, value) => {
                set(state => ({ settings: { ...state.settings, [key]: value } }));
                if (key === 'autostart' || key === 'killswitch' || key === 'adblock') {
                    if (key === 'adblock' && value) {
                        import('../services/adblock').then(({ adblockService }) => {
                            adblockService.updateHosts().catch(() => { });
                        });
                    }
                    apiFetch(`/api/${key}`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ enable: value }),
                    }).catch(() => { });
                }
            },

            handleSaveProxy: async (
                proxyData,
                activeProxy,
                failedProxy,
                setFailedProxy,
                setActiveProxy,
                isConnected,
                selectAndConnect,
                addLog,
            ) => {
                let countryCode = await detectCountry(proxyData.ip ?? '');
                if (
                    countryCode === 'unknown' &&
                    proxyData.country &&
                    proxyData.country !== '🌐' &&
                    proxyData.country !== 'unknown'
                ) {
                    countryCode = proxyData.country;
                }

                const finalProxy = { ...proxyData, country: countryCode } as ProxyItem;

                if (proxyData.id) {
                    set(state => ({
                        proxies: state.proxies.map(p =>
                            p.id === proxyData.id ? finalProxy : p,
                        ),
                        editingProxy: null,
                    }));
                    if (failedProxy?.id === proxyData.id) setFailedProxy(null);
                    addLog(`Профиль "${proxyData.name}" обновлен.`, 'success');

                    if (activeProxy?.id === proxyData.id) {
                        setActiveProxy(finalProxy);
                        if (isConnected) {
                            addLog('Применение новых настроек, перезапуск...', 'info');
                            setTimeout(() => selectAndConnect(finalProxy, true), 100);
                        }
                    }
                } else {
                    set(state => ({
                        proxies: [...state.proxies, { ...finalProxy, id: Date.now() }],
                        editingProxy: null,
                    }));
                    addLog(`Новый профиль "${proxyData.name}" добавлен.`, 'success');
                }

                get().syncConfig();
                get().syncProxies();
            },

            handleBulkSaveProxies: async (proxiesToImport, protocol, addLog) => {
                const results: ProxyItem[] = [];
                const now = Date.now();

                for (let i = 0; i < proxiesToImport.length; i++) {
                    const p = proxiesToImport[i];
                    const country = await detectCountry(p.ip);
                    const timeStr = new Date().toLocaleTimeString('ru-RU', { hour12: false });
                    results.push({
                        ...p,
                        id: now + i,
                        type: protocol,
                        country,
                        name: p.name || `${i18next.t('add.newServer')} ${timeStr}`,
                    });
                }

                set(state => ({
                    proxies: [...state.proxies, ...results],
                }));

                addLog(`Импортировано прокси: ${results.length}`, 'success');
                get().syncConfig();
                get().syncProxies();
            },
        }), {
        name: 'config-storage',
        storage: createJSONStorage(() => encryptedStorage),
        partialize: (state) => ({
            proxies: state.proxies,
            routingRules: state.routingRules,
            settings: state.settings,
        }),
    }));
