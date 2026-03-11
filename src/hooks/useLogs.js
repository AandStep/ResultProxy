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

import { useState, useEffect, useCallback } from "react";

export const DAEMON_URL = "http://127.0.0.1:14080";

export const apiFetch = async (endpoint, options = {}) => {
  const token = window.electronAPI ? window.electronAPI.getApiToken() : "";
  const headers = {
    ...options.headers,
    Authorization: `Bearer ${token}`,
  };
  return fetch(`${DAEMON_URL}${endpoint}`, { ...options, headers });
};

export const useLogs = () => {
  const [logs, setLogs] = useState([
    {
      timestamp: Date.now(),
      time: new Date().toLocaleTimeString(),
      msg: "Интерфейс запущен. Загрузка конфигурации...",
      type: "info",
    },
  ]);
  const [backendLogs, setBackendLogs] = useState([]);

  const addLog = useCallback((msg, type = "info") => {
    setLogs((prev) =>
      [
        {
          timestamp: Date.now(),
          time: new Date().toLocaleTimeString(),
          msg,
          type,
        },
        ...prev,
      ].slice(0, 50),
    );
  }, []);

  useEffect(() => {
    let interval;
    const fetchLogs = async () => {
      try {
        const res = await apiFetch(`/api/logs`);
        if (res.ok) {
          const data = await res.json();
          setBackendLogs(data);
        }
      } catch (e) {}
    };

    fetchLogs();
    interval = setInterval(fetchLogs, 1500);

    return () => clearInterval(interval);
  }, []);

  return { logs, backendLogs, addLog };
};
