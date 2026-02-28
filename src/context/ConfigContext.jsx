import React, { createContext, useContext, useState } from "react";
import { useAppConfig } from "../hooks/useAppConfig";
import { useLogContext } from "./LogContext";

const ConfigContext = createContext();

export const ConfigProvider = ({ children }) => {
  const { addLog } = useLogContext();
  const config = useAppConfig(addLog);
  const [activeTab, setActiveTab] = useState("home");
  const [editingProxy, setEditingProxy] = useState(null);
  const [connectionMode, setConnectionMode] = useState(() => {
    return localStorage.getItem("connectionMode") || "proxy";
  });

  // Persist connectionMode
  React.useEffect(() => {
    localStorage.setItem("connectionMode", connectionMode);
  }, [connectionMode]);

  const value = {
    ...config,
    activeTab,
    setActiveTab,
    editingProxy,
    setEditingProxy,
    connectionMode,
    setConnectionMode,
  };

  return (
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
};

export const useConfigContext = () => {
  const context = useContext(ConfigContext);
  if (!context)
    throw new Error("useConfigContext must be used within ConfigProvider");
  return context;
};
