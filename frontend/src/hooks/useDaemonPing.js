/*
 * Copyright (C) 2026 ResultProxy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { useState, useEffect } from "react";
import wailsAPI from "../utils/wailsAPI";

export const useDaemonPing = (proxies, isConfigLoaded) => {
    const [pings, setPings] = useState({});

    useEffect(() => {
        if (!isConfigLoaded || proxies.length === 0) return;

        const fetchPings = async () => {
            const newPings = {};
            for (const p of proxies) {
                try {
                    const data = await wailsAPI.ping(p.ip, parseInt(p.port, 10) || 0);
                    if (data && data.reachable) {
                        newPings[p.id] = `${data.latencyMs}ms`;
                    } else {
                        newPings[p.id] = "Timeout";
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
