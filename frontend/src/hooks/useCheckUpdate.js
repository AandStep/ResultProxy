/*
 * Copyright (C) 2026 ResultProxy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import { useState, useEffect } from "react";
import { compareVersions } from "../utils/versionCheck";
// In a real Wails app, we'd add GetVersion() to App
// For now, hardcode or fetch from a config

const UPDATE_URL =
    "https://raw.githubusercontent.com/AandStep/ResultProxy/main/update.json";

export const useCheckUpdate = () => {
    const [updateAvailable, setUpdateAvailable] = useState(false);
    const [latestVersionData, setLatestVersionData] = useState(null);
    const [currentVersion, setCurrentVersion] = useState("2.2.2");
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const checkUpdate = async () => {
            try {
                setLoading(true);
                // Placeholder version. You'd normally call `await GetVersion()` here
                const localVersion = "2.2.2";
                setCurrentVersion(localVersion);

                const cacheBuster = `?_t=${Date.now()}`;
                const remoteResponse = await fetch(`${UPDATE_URL}${cacheBuster}`);
                const remoteData = await remoteResponse.json();

                setLatestVersionData(remoteData);

                if (localVersion && remoteData.version) {
                    const isNewer =
                        compareVersions(localVersion, remoteData.version) === -1;
                    setUpdateAvailable(isNewer);
                }
            } catch (error) {
                console.error("Ошибка проверки обновлений:", error);
            } finally {
                setLoading(false);
            }
        };

        checkUpdate();
    }, []);

    return { updateAvailable, latestVersionData, currentVersion, loading };
};
