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

// Удален useAppContext, так как его использование вызывает ререндер
// всего дерева при изменении логов или скорости.
// Компоненты переведены на useLogContext, useConfigContext, useConnectionContext
