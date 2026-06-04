import { useEffect } from "react";

declare const __APP_BUILD_TIME__: string;

const BUILD_KEY = "streamscout-app-build-time";
const RELOAD_KEY = "streamscout-app-reloaded-for-build";

export function AppUpdateRefresher() {
  useEffect(() => {
    const refreshOldAppCache = async () => {
      if (!("serviceWorker" in navigator) || !("caches" in window)) return;

      const previousBuild = localStorage.getItem(BUILD_KEY);
      if (!previousBuild) {
        localStorage.setItem(BUILD_KEY, __APP_BUILD_TIME__);
        return;
      }

      if (previousBuild === __APP_BUILD_TIME__) return;

      localStorage.setItem(BUILD_KEY, __APP_BUILD_TIME__);
      const alreadyReloaded = sessionStorage.getItem(RELOAD_KEY) === __APP_BUILD_TIME__;
      if (alreadyReloaded) return;

      sessionStorage.setItem(RELOAD_KEY, __APP_BUILD_TIME__);
      const [cacheNames, registrations] = await Promise.all([
        caches.keys(),
        navigator.serviceWorker.getRegistrations(),
      ]);

      await Promise.all([
        ...cacheNames.map((name) => caches.delete(name)),
        ...registrations.map((registration) => registration.update()),
      ]);

      window.location.reload();
    };

    refreshOldAppCache().catch(() => undefined);
  }, []);

  return null;
}