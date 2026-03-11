/*
 * Copyright (C) 2026 ResultProxy
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
import { apiFetch } from "./useLogs";

export const useDaemonStatus = (
  isConnected,
  setIsConnected,
  proxies,
  failedProxy,
  setFailedProxy,
  setActiveProxy,
  isSwitchingRef,
  addLog,
) => {
  const [isProxyDead, setIsProxyDead] = useState(false);
  const [stats, setStats] = useState({ download: 0, upload: 0 });
  const [speedHistory, setSpeedHistory] = useState({
    down: new Array(20).fill(0),
    up: new Array(20).fill(0),
  });
  const [daemonStatus, setDaemonStatus] = useState("checking");
  const prevProxyDead = useRef(false);

  useEffect(() => {
    let interval;
    const fetchStatus = async () => {
      try {
        const res = await apiFetch(`/api/status`);
        if (res.ok) {
          const data = await res.json();
          if (daemonStatus !== "online") setDaemonStatus("online");

          setIsProxyDead(!!data.isProxyDead);
          if (data.isConnected) {
            setFailedProxy(null);
          }

          if (data.isConnected) {
            if (data.isProxyDead && !prevProxyDead.current) {
              addLog(
                `Внимание: Узел ${
                  data.activeProxy?.ip || ""
                } перестал отвечать!`,
                "error",
              );
            } else if (!data.isProxyDead && prevProxyDead.current) {
              addLog(`Связь с узлом восстановлена.`, "success");
            }
          }
          prevProxyDead.current = !!data.isProxyDead;

          if (!isSwitchingRef.current) {
            setIsConnected(data.isConnected);
            if (data.activeProxy) {
              const localMatchedProxy = proxies.find(
                (p) =>
                  p.id === data.activeProxy.id || p.ip === data.activeProxy.ip,
              );
              setActiveProxy(localMatchedProxy || data.activeProxy);
            }
          }

          setStats({ download: data.bytesReceived, upload: data.bytesSent });
          setSpeedHistory((h) => ({
            down: [...h.down.slice(1), data.speedReceived || 0],
            up: [...h.up.slice(1), data.speedSent || 0],
          }));
        }
      } catch (error) {
        setDaemonStatus("offline");
        if (isConnected) setIsConnected(false);
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
  ]);

  return { isProxyDead, stats, speedHistory, daemonStatus };
};
