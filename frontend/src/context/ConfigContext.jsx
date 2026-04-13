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

import React, { createContext, useContext, useState } from "react";
import { useAppConfig } from "../hooks/useAppConfig";
import { useLogContext } from "./LogContext";

const ConfigContext = createContext();

export const ConfigProvider = ({ children }) => {
    const { addLog } = useLogContext();
    const config = useAppConfig(addLog);
    const [activeTab, setActiveTab] = useState("home");
    const [editingProxy, setEditingProxy] = useState(null);

    const value = {
        ...config,
        activeTab,
        setActiveTab,
        editingProxy,
        setEditingProxy,
    };

    return (
        <ConfigContext.Provider value={value}>
            {children}
        </ConfigContext.Provider>
    );
};

export const useConfigContext = () => {
    const context = useContext(ConfigContext);
    if (!context) throw new Error("useConfigContext must be used within ConfigProvider");
    return context;
};
