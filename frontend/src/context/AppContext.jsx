/*
 * Copyright (C) 2026 ResultProxy
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 */

import React from "react";
import { LogProvider } from "./LogContext";
import { ConfigProvider } from "./ConfigContext";
import { ConnectionProvider } from "./ConnectionContext";

export const AppProvider = ({ children }) => {
    return (
        <LogProvider>
            <ConfigProvider>
                <ConnectionProvider>{children}</ConnectionProvider>
            </ConfigProvider>
        </LogProvider>
    );
};
