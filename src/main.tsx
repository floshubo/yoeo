import React from "react";
import { Capacitor } from '@capacitor/core';
import { createRoot } from "react-dom/client";
import "@fontsource-variable/geologica";
import App from "./App";
import { I18nProvider } from './i18n';
import "./styles.css";
if (Capacitor.isNativePlatform()) document.documentElement.classList.add('native-app');
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <I18nProvider><App /></I18nProvider>
  </React.StrictMode>,
);
if ("serviceWorker" in navigator && !import.meta.env.DEV && !Capacitor.isNativePlatform())
  window.addEventListener("load", () =>
    navigator.serviceWorker.register("/sw.js").catch(() => {}),
  );
