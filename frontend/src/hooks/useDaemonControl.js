/*
 * Copyright (C) 2026 ResultV
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
 */

import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import wailsAPI from "../utils/wailsAPI";

export const useDaemonControl = (
    isConnected,
    setIsConnected,
    setIsConnecting,
    activeProxy,
    setActiveProxy,
    failedProxy,
    setFailedProxy,
    proxies,
    routingRules,
    settings,
    updateSetting,
    daemonStatus,
    isSwitchingRef,
    addLog,
    showAlertDialog,
) => {
    const { t } = useTranslation();
    const disconnectOnly = useCallback(async () => {
        if (isSwitchingRef.current) return;

        try {
            isSwitchingRef.current = true;
            setIsConnecting(false);
            addLog("Отключение...", "info");
            await wailsAPI.disconnect();
            setIsConnected(false);
            setFailedProxy(null);
            addLog("Отключено успешно.", "success");
        } catch (error) {
            addLog(`Сбой отключения: ${error.message || error}`, "error");
        } finally {
            setTimeout(() => {
                isSwitchingRef.current = false;
            }, 1000);
        }
    }, [addLog, isSwitchingRef, setFailedProxy, setIsConnected, setIsConnecting]);

    const toggleConnection = useCallback(async () => {
        if (isSwitchingRef.current) return;
        if (daemonStatus !== "online") {
            addLog("Служба недоступна.", "error");
            return;
        }

        const targetProxy =
            activeProxy ||
            proxies.find((p) => String(p.id) === String(settings?.lastSelectedProxyId)) ||
            proxies[0];
        if (proxies.length === 0 || !targetProxy) return;

        try {
            isSwitchingRef.current = true;
            setFailedProxy(null);

            if (isConnected) {
                setIsConnecting(false);
                addLog("Отключение...", "info");
                await wailsAPI.disconnect();
                addLog("Отключено успешно.", "success");
                setIsConnected(false);
            } else {
                setIsConnecting(true);
                addLog(`Подключение к ${targetProxy.name}...`, "info");
                setActiveProxy(targetProxy);
                if (String(settings?.lastSelectedProxyId) !== String(targetProxy.id)) {
                    updateSetting("lastSelectedProxyId", targetProxy.id);
                }

                const res = await wailsAPI.connect(
                    { ...targetProxy, port: parseInt(targetProxy.port, 10) || 0 },
                    routingRules,
                    settings.killswitch || false,
                    settings.adblock || false
                );

                if (!res.success) {
                    if (res.errorCode === "tun_privileges") {
                        setIsConnecting(false);
                        addLog(
                            res.message || t("tunnel.adminMessage"),
                            "error",
                        );
                        showAlertDialog({
                            title: t("tunnel.adminTitle"),
                            message: t("tunnel.adminMessage"),
                            variant: "warning",
                            confirmText: t("tunnel.restartAsAdmin"),
                            onConfirmAction: () => wailsAPI.restartAsAdmin(),
                        });
                        setTimeout(() => {
                            isSwitchingRef.current = false;
                        }, 3000);
                        return;
                    }
                    const reason = res.reason ? ` Причина: ${res.reason}` : "";
                    const code = res.errorCode ? ` Код: ${res.errorCode}` : "";
                    throw new Error((res.message || "Unknown proxy connection error") + code + reason);
                }

                addLog("Соединение установлено.", "success");
                if (res.tunnelFailed) {
                    addLog(`Туннелирование не запущено: ${res.reason || "неизвестная причина"}`, "warning");
                    if (res.fallbackUsed) {
                        addLog("Подключение работает в fallback-режиме без TUN.", "warning");
                    }
                }
                
                
                
                setIsConnected(true);
                setIsConnecting(false);
            }

            setTimeout(() => {
                isSwitchingRef.current = false;
            }, 3000);
        } catch (error) {
            isSwitchingRef.current = false;
            setIsConnecting(false);
            setFailedProxy(targetProxy);
            addLog(`Сбой: ${error.message || error}`, "error");
        }
    }, [
        addLog,
        daemonStatus,
        activeProxy,
        proxies,
        isConnected,
        routingRules,
        settings,
        setIsConnected,
        setActiveProxy,
        setFailedProxy,
        isSwitchingRef,
        setIsConnecting,
        updateSetting,
        showAlertDialog,
        t,
    ]);

    const selectAndConnect = useCallback(
        async (proxy, forceReconnect = false, setActiveTab) => {
            if (isSwitchingRef.current) return;
            if (!forceReconnect && activeProxy?.id === proxy.id && isConnected)
                return;

            try {
                isSwitchingRef.current = true;
                setFailedProxy(null);
                if (setActiveTab) setActiveTab("home");
                setActiveProxy(proxy);
                if (String(settings?.lastSelectedProxyId) !== String(proxy.id)) {
                    updateSetting("lastSelectedProxyId", proxy.id);
                }
                addLog(`Переключение на: ${proxy.name}...`, "info");

                if (isConnected) {
                    await wailsAPI.disconnect();
                    setIsConnected(false);
                }

                setIsConnecting(true);
                const res = await wailsAPI.connect(
                    { ...proxy, port: parseInt(proxy.port, 10) || 0 },
                    routingRules,
                    settings.killswitch || false,
                    settings.adblock || false
                );

                if (!res.success) {
                    if (res.errorCode === "tun_privileges") {
                        setIsConnecting(false);
                        addLog(
                            res.message || t("tunnel.adminMessage"),
                            "error",
                        );
                        showAlertDialog({
                            title: t("tunnel.adminTitle"),
                            message: t("tunnel.adminMessage"),
                            variant: "warning",
                            confirmText: t("tunnel.restartAsAdmin"),
                            onConfirmAction: () => wailsAPI.restartAsAdmin(),
                        });
                        setTimeout(() => {
                            isSwitchingRef.current = false;
                        }, 2000);
                        return;
                    }
                    const reason = res.reason ? ` Причина: ${res.reason}` : "";
                    const code = res.errorCode ? ` Код: ${res.errorCode}` : "";
                    throw new Error((res.message || "Ошибка смены прокси: Узел отклонил подключение") + code + reason);
                }

                setIsConnected(true);
                setIsConnecting(false);
                addLog(`Успешно переключено на ${proxy.name}`, "success");
                if (res.tunnelFailed) {
                    addLog(`Туннелирование не запущено: ${res.reason || "неизвестная причина"}`, "warning");
                    if (res.fallbackUsed) {
                        addLog("Подключение работает в fallback-режиме без TUN.", "warning");
                    }
                }

                setTimeout(() => {
                    isSwitchingRef.current = false;
                }, 2000);
            } catch (error) {
                isSwitchingRef.current = false;
                setIsConnecting(false);
                setFailedProxy(proxy);
                addLog(`Сбой подключения: ${error.message || error}`, "error");
            }
        },
        [
            activeProxy,
            isConnected,
            routingRules,
            settings,
            addLog,
            setActiveProxy,
            setFailedProxy,
            setIsConnected,
            setIsConnecting,
            isSwitchingRef,
            updateSetting,
            showAlertDialog,
            t,
        ],
    );

    const deleteProxy = useCallback(
        async (id, setProxies) => {
            const isDeletingActive = activeProxy?.id === id;
            setProxies((prev) => prev.filter((p) => p.id !== id));

            if (isDeletingActive) {
                if (isConnected) {
                    isSwitchingRef.current = true;
                    setIsConnecting(false);
                    addLog("Активный сервер удален. Разрыв соединения...", "info");
                    try {
                        await wailsAPI.disconnect();
                        addLog("Отключено успешно.", "success");
                    } catch (e) {}
                    setIsConnected(false);
                    setActiveProxy(null);
                    setTimeout(() => {
                        isSwitchingRef.current = false;
                    }, 2000);
                } else {
                    setActiveProxy(null);
                }
            }
            if (failedProxy?.id === id) setFailedProxy(null);
        },
        [
            activeProxy,
            isConnected,
            failedProxy,
            addLog,
            setActiveProxy,
            setIsConnected,
            setIsConnecting,
            setFailedProxy,
            isSwitchingRef,
        ],
    );

    return { disconnectOnly, toggleConnection, selectAndConnect, deleteProxy };
};
