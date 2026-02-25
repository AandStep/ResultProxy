import React from "react";
import { useTranslation } from "react-i18next";
import { FlagIcon } from "./FlagIcon";

export const LanguageSwitcher = () => {
  const { i18n } = useTranslation();

  const toggleLanguage = () => {
    // defaults to en if the current lang is somewhat unresolved, but generally toggles
    const nextLang = i18n.language?.startsWith("ru") ? "en" : "ru";
    i18n.changeLanguage(nextLang);
  };

  const isRu = i18n.language?.startsWith("ru");

  return (
    <button
      onClick={toggleLanguage}
      className="flex items-center justify-center p-1.5 rounded-xl hover:bg-zinc-800 transition-colors border-transparent outline-none focus:outline-none focus:ring-0 focus-visible:outline-none shrink-0"
      title={isRu ? "Switch to English" : "Переключить на русский"}
    >
      <FlagIcon
        code={isRu ? "RU" : "US"}
        className="h-4 w-auto rounded-[2px] shadow-sm object-contain"
      />
    </button>
  );
};
