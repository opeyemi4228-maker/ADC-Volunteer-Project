"use client";

import { createContext, useContext, useMemo } from "react";

import { translator, normalizeLang } from "./index.js";

const LangContext = createContext("en");

export function I18nProvider({ lang, children }) {
  return <LangContext.Provider value={normalizeLang(lang)}>{children}</LangContext.Provider>;
}

export function useLang() {
  return useContext(LangContext);
}

export function useT() {
  const lang = useContext(LangContext);
  return useMemo(() => translator(lang), [lang]);
}
