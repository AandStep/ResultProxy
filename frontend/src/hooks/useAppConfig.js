/*
 * Copyright (C) 2026 ResultProxy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { useState, useEffect, useCallback } from "react";
import wailsAPI from "../utils/wailsAPI";
import { detectCountry } from "../utils/network";

export const useAppConfig = (addLog) => {
    const [isConfigLoaded, setIsConfigLoaded] = useState(false);
    const [proxies, setProxies] = useState([]);
    const [routingRules, setRoutingRules] = useState({
        mode: "global",
        whitelist: ["localhost", "127.0.0.1"],
        appWhitelist: [],
    });
    const [settings, setSettings] = useState({
        autostart: false,
        killswitch: false,
        adblock: false,
        mode: "proxy",
        language: "ru",
        theme: "dark"
    });
    const [showProtocolModal, setShowProtocolModal] = useState(false);
    const [platform, setPlatform] = useState("windows");

    useEffect(() => {
        const loadInitialConfig = async () => {
            try {
                const plat = await wailsAPI.getPlatform();
                setPlatform(plat);

                const config = await wailsAPI.getConfig();
                if (config) {
                    if (config.proxies && Array.isArray(config.proxies)) {
                        setProxies(config.proxies.map(p => ({ ...p, port: parseInt(p.port, 10) || 0, id: String(p.id) })));
                    }
                    if (config.routingRules) {
                        setRoutingRules(config.routingRules);
                    }
                    if (config.settings) {
                        setSettings(config.settings);
                    }
                    setIsConfigLoaded(true);
                    addLog("Конфигурация успешно загружена.", "success");
                }
            } catch (err) {
                console.error("Failed to load config:", err);
                setIsConfigLoaded(true);
                addLog(`Служба недоступна (${err.toString()}). Используются базовые настройки.`, "error");
            }
        };

        loadInitialConfig();
    }, [addLog]);

    // Save rules when changed
    useEffect(() => {
        if (!isConfigLoaded) return;
        wailsAPI.updateRules(routingRules).catch(err => console.error("UpdateRules err:", err));
    }, [routingRules, isConfigLoaded]);

    useEffect(() => {
        if (!isConfigLoaded) return;
        const sanitizedProxies = proxies.map(p => ({ ...p, port: parseInt(p.port, 10) || 0, id: String(p.id) }));
        wailsAPI.syncProxies(sanitizedProxies).catch(err => console.error("SyncProxies err:", err));
    }, [proxies, isConfigLoaded]);

    const updateSetting = useCallback((key, value) => {
        setSettings((prev) => {
            const newSettings = { ...prev, [key]: value };
            
            // Save the entire config object immediately
            wailsAPI.saveConfig({
                proxies: proxies.map(p => ({ ...p, port: parseInt(p.port, 10) || 0, id: String(p.id) })),
                routingRules,
                settings: newSettings
            }).catch(console.error);

            return newSettings;
        });

        // Trigger native OS features
        if (key === "autostart") {
            wailsAPI.setAutostart(value).catch(err => {
                console.error("Autostart error:", err);
                setSettings(prev => ({ ...prev, [key]: !value }));
                alert(`Ошибка настройки автостарта:\n\n${err}`);
            });
        } else if (key === "killswitch") {
            wailsAPI.toggleKillSwitch(value).catch(err => {
                console.error("Kill switch error:", err);
                setSettings(prev => ({ ...prev, [key]: !value }));
            });
        } else if (key === "adblock") {
            wailsAPI.toggleAdBlock(value).catch(err => console.error("Ad block error:", err));
        }
    }, [proxies, routingRules]);

    const handleSaveProxy = useCallback(
        async (
            proxyData,
            activeProxy,
            failedProxy,
            setFailedProxy,
            setActiveProxy,
            isConnected,
            selectAndConnect,
            setActiveTab,
            setEditingProxy,
        ) => {
            let countryCode = await detectCountry(proxyData.ip);

            if (
                countryCode === "unknown" &&
                proxyData.country &&
                proxyData.country !== "🌐" &&
                proxyData.country !== "unknown"
            ) {
                countryCode = proxyData.country;
            }

            const finalProxy = { ...proxyData, country: countryCode, port: parseInt(proxyData.port, 10) || 0, id: String(proxyData.id || Date.now()) };

            if (proxyData.id) {
                setProxies((prev) =>
                    prev.map((p) => (String(p.id) === finalProxy.id ? finalProxy : p))
                );
                if (String(failedProxy?.id) === finalProxy.id) setFailedProxy(null);
                addLog(`Профиль "${proxyData.name}" обновлен.`, "success");

                if (String(activeProxy?.id) === finalProxy.id) {
                    setActiveProxy(finalProxy);
                    if (isConnected) {
                        addLog("Применение новых настроек, переподключение...", "info");
                        setTimeout(() => {
                            selectAndConnect(finalProxy, true);
                        }, 100);
                        setActiveTab("list");
                    } else {
                        setActiveTab("list");
                    }
                } else {
                    setActiveTab("list");
                }
            } else {
                setProxies((prev) => [...prev, finalProxy]);
                addLog(`Новый профиль "${proxyData.name}" добавлен.`, "success");
                setActiveTab("list");
            }
            setEditingProxy(null);
        },
        [addLog]
    );

    const handleBulkSaveProxies = useCallback(
        async (proxiesData, setActiveTab, defaultProtocol) => {
            const now = Date.now();
            const finalProxies = await Promise.all(
                proxiesData.map(async (p, index) => {
                    const countryCode = await detectCountry(p.ip);
                    return {
                        ...p,
                        id: String(now + index),
                        country: countryCode,
                        type: defaultProtocol || p.type || "HTTP",
                        port: parseInt(p.port, 10) || 0,
                    };
                })
            );

            setProxies((prev) => [...prev, ...finalProxies]);
            addLog(`Добавлено ${finalProxies.length} новых прокси.`, "success");
            setActiveTab("list");
        },
        [addLog]
    );

    return {
        isConfigLoaded,
        proxies,
        setProxies,
        routingRules,
        setRoutingRules,
        settings,
        setSettings,
        updateSetting,
        handleSaveProxy,
        handleBulkSaveProxies,
        showProtocolModal,
        setShowProtocolModal,
        platform,
    };
};
