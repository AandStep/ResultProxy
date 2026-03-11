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

import { useState, useEffect } from "react";
import { apiFetch } from "./useLogs";

export const useDaemonPing = (proxies, isConfigLoaded) => {
  const [pings, setPings] = useState({});

  useEffect(() => {
    if (!isConfigLoaded || proxies.length === 0) return;

    const fetchPings = async () => {
      const newPings = {};
      for (const p of proxies) {
        try {
          const res = await apiFetch(`/api/ping`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ip: p.ip, port: p.port }),
          });
          if (res.ok) {
            const data = await res.json();
            newPings[p.id] = data.alive ? `${data.ping}ms` : "Timeout";
          } else {
            newPings[p.id] = "Error";
          }
        } catch {
          newPings[p.id] = "Error";
        }
      }
      setPings(newPings);
    };

    fetchPings();
    const interval = setInterval(fetchPings, 10000);
    return () => clearInterval(interval);
  }, [proxies, isConfigLoaded]);

  return pings;
};
