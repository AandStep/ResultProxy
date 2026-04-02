/*
 * Copyright (C) 2026 ResultProxy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import React, { createContext, useContext } from "react";
import { useLogs } from "../hooks/useLogs";

const LogContext = createContext();

export const LogProvider = ({ children }) => {
    const { logs, backendLogs, addLog } = useLogs();

    return (
        <LogContext.Provider value={{ logs, backendLogs, addLog }}>
            {children}
        </LogContext.Provider>
    );
};

export const useLogContext = () => {
    const context = useContext(LogContext);
    if (!context) throw new Error("useLogContext must be used within LogProvider");
    return context;
};
