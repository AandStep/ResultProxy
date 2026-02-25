import React, { createContext, useContext } from "react";
import { useLogs } from "../hooks/useLogs";

const LogContext = createContext();

export const LogProvider = ({ children }) => {
  const logData = useLogs();
  return <LogContext.Provider value={logData}>{children}</LogContext.Provider>;
};

export const useLogContext = () => {
  const context = useContext(LogContext);
  if (!context)
    throw new Error("useLogContext must be used within LogProvider");
  return context;
};
