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
    <ConfigContext.Provider value={value}>{children}</ConfigContext.Provider>
  );
};

export const useConfigContext = () => {
  const context = useContext(ConfigContext);
  if (!context)
    throw new Error("useConfigContext must be used within ConfigProvider");
  return context;
};
