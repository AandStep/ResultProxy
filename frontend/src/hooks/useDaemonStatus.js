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

import { useState, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import wailsAPI from "../utils/wailsAPI";

export const useDaemonStatus = (
    isConnected,
    setIsConnected,
    proxies,
    failedProxy,
    setFailedProxy,
    setActiveProxy,
    isSwitchingRef,
    addLog,
    settings,
    activeProxy,
    statusGenerationRef,
    showAlertDialog,
    updateSetting,
) => {
    const { t } = useTranslation();
    const [isProxyDead, setIsProxyDead] = useState(false);
    const [stats, setStats] = useState({ download: 0, upload: 0 });
    const [speedHistory, setSpeedHistory] = useState({
        down: new Array(20).fill(0),
        up: new Array(20).fill(0),
    });
    const [daemonStatus, setDaemonStatus] = useState("checking");
    const prevProxyDead = useRef(false);
    const prevConnectedRef = useRef(false);
    const emergencyPopupShownRef = useRef(false);
    const emergencyActionInFlightRef = useRef(false);
    const statusErrorStreakRef = useRef(0);

    useEffect(() => {
        let interval;
        const fetchStatus = async () => {
            const genAtStart = statusGenerationRef ? statusGenerationRef.current : 0;
            try {
                const data = await wailsAPI.getStatus();
                // Drop the response if a user action started or ended during the
                // await — the daemon snapshot we just got is stale relative to
                // the new intent and would flap isConnected back to its old value.
                const genChanged = statusGenerationRef && statusGenerationRef.current !== genAtStart;
                if (genChanged) return;
                if (!data || typeof data !== "object") {
                    throw new Error("invalid daemon status payload");
                }
                statusErrorStreakRef.current = 0;
                if (daemonStatus !== "online") setDaemonStatus("online");

                const connected = !!data.isConnected;
                const killSwitchActive = !!data.killSwitchActive;
                const proxyDead = !!data.isProxyDead;

                setIsProxyDead(proxyDead);
                if (connected && !proxyDead) {
                    setFailedProxy(null);
                }

                const configuredKillSwitch = !!settings?.killswitch;
                const killSwitchEngaged = killSwitchActive || configuredKillSwitch;
                // Two firing conditions for the emergency modal:
                //  (a) we *were* connected last tick and now we're not, while
                //      kill switch is on — classic "server dropped, firewall is
                //      now holding all traffic".
                //  (b) backend still says connected but the health watchdog
                //      flagged the proxy dead — sing-box's local listener is
                //      alive but upstream is gone, firewall is blocking and the
                //      user has no idea why nothing loads.
                const droppedWithKillSwitch =
                    prevConnectedRef.current && !connected && killSwitchEngaged;
                const aliveButProxyDead =
                    connected && proxyDead && killSwitchEngaged;
                const killSwitchTriggered =
                    (droppedWithKillSwitch || aliveButProxyDead) && !isSwitchingRef.current;

                if (
                    killSwitchTriggered &&
                    !emergencyPopupShownRef.current &&
                    !emergencyActionInFlightRef.current &&
                    typeof showAlertDialog === "function"
                ) {
                    emergencyPopupShownRef.current = true;
                    showAlertDialog({
                        title: t("killswitchPopup.title"),
                        message: t("killswitchPopup.message"),
                        variant: "danger",
                        confirmText: t("killswitchPopup.confirm"),
                        onConfirmAction: async () => {
                            if (emergencyActionInFlightRef.current) return;
                            emergencyActionInFlightRef.current = true;
                            addLog("[KILL SWITCH] Подтверждено: отключаем сервер и снимаем блокировку фаервола.", "warning");
                            try {
                                await wailsAPI.disconnect();
                            } catch (e) {
                                // best effort
                            }
                            try {
                                // Always clear firewall rules via toggleKillSwitch(false).
                                // We deliberately do NOT touch settings.killswitch — the
                                // feature stays enabled so the next Connect re-arms the
                                // rules; the user only wanted out of the *current* block.
                                await wailsAPI.toggleKillSwitch(false);
                                setIsConnected(false);
                                setIsProxyDead(false);
                                setFailedProxy(null);
                                addLog("[KILL SWITCH] Сервер отключён, правила фаервола сняты. Настройка Kill Switch активна.", "success");
                            } catch (e) {
                                addLog(`[KILL SWITCH] Ошибка снятия блокировки: ${e?.message || e}`, "error");
                            } finally {
                                emergencyActionInFlightRef.current = false;
                            }
                        },
                    });
                }
                // Reset the one-shot flag when the situation clears: either we
                // reconnected and the probe is healthy again, or kill switch is
                // off entirely. Without this, the modal would never show twice
                // in one session.
                if ((connected && !proxyDead) || !killSwitchEngaged) {
                    emergencyPopupShownRef.current = false;
                }
                prevConnectedRef.current = connected;

                if (connected) {
                    if (data.isProxyDead && !prevProxyDead.current) {
                        addLog(
                            `Внимание: Узел ${
                                data.currentProxy?.ip || ""
                            } перестал отвечать! (Kill Switch: ${data.killSwitchActive})`,
                            "error",
                        );
                    } else if (!data.isProxyDead && prevProxyDead.current) {
                        addLog(`Связь с узлом восстановлена.`, "success");
                    }
                }
                prevProxyDead.current = !!data.isProxyDead;

                if (!isSwitchingRef.current) {
                    setIsConnected(connected);
                    if (data.currentProxy) {
                        const currentID = String(data.currentProxy.id || "").trim();
                        const currentIP = String(data.currentProxy.ip || "").trim().toLowerCase();
                        const currentType = String(data.currentProxy.type || "").trim().toLowerCase();
                        const currentPort = Number(data.currentProxy.port || 0);
                        const localMatchedProxy = proxies.find(
                            (p) => {
                                if (p.type?.toUpperCase() === "SECTION") {
                                    return false;
                                }
                                const proxyID = String(p.id || "").trim();
                                if (currentID && proxyID && proxyID === currentID) {
                                    return true;
                                }
                                const proxyIP = String(p.ip || "").trim().toLowerCase();
                                const proxyType = String(p.type || "").trim().toLowerCase();
                                const proxyPort = Number(p.port || 0);
                                return (
                                    proxyIP === currentIP &&
                                    proxyPort === currentPort &&
                                    proxyType === currentType
                                );
                            },
                        );

                        let resolvedProxy = localMatchedProxy || data.currentProxy;

                        if (activeProxy && activeProxy.type?.toUpperCase() !== "AUTO") {
                            // If the user explicitly selected a non-AUTO proxy and the daemon
                            // is connected to the same IP:port:type, keep showing that proxy.
                            // This prevents a different proxy with the same address (e.g. a
                            // renamed AUTO member) from overriding the display.
                            const activeIP = String(activeProxy.ip || "").trim().toLowerCase();
                            const activePort = Number(activeProxy.port || 0);
                            const activeType = String(activeProxy.type || "").trim().toLowerCase();
                            if (activeIP === currentIP && activePort === currentPort && activeType === currentType) {
                                resolvedProxy = activeProxy;
                            }
                        } else if (localMatchedProxy && activeProxy?.type?.toUpperCase() === "AUTO") {
                            try {
                                const extra = typeof activeProxy.extra === 'string' ? JSON.parse(activeProxy.extra) : (activeProxy.extra || {});
                                const memberIds = (extra.members || []).map(String);
                                if (memberIds.includes(String(localMatchedProxy.id))) {
                                    resolvedProxy = activeProxy;
                                }
                            } catch (e) {}
                        }

                        if (
                            resolvedProxy &&
                            String(resolvedProxy.type || "").toUpperCase() !== "SECTION"
                        ) {
                            setActiveProxy(resolvedProxy);
                        }
                    }
                }

                setStats({ download: data.bytesReceived, upload: data.bytesSent });
                setSpeedHistory((h) => ({
                    down: [...h.down.slice(1), data.speedReceived || 0],
                    up: [...h.up.slice(1), data.speedSent || 0],
                }));
                
            } catch (error) {
                statusErrorStreakRef.current += 1;
                if (statusErrorStreakRef.current >= 3) {
                    setDaemonStatus("offline");
                    if (isConnected) setIsConnected(false);
                }
            }
        };

        fetchStatus();
        interval = setInterval(fetchStatus, 1000);
        return () => clearInterval(interval);
    }, [
        isConnected,
        daemonStatus,
        proxies,
        failedProxy,
        addLog,
        setIsConnected,
        setActiveProxy,
        setFailedProxy,
        isSwitchingRef,
        activeProxy,
        statusGenerationRef,
        showAlertDialog,
        settings,
        updateSetting,
        t,
    ]);

    return { isProxyDead, stats, speedHistory, daemonStatus };
};
