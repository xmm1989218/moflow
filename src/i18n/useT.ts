import { useSyncExternalStore } from "react";

let listeners: (() => void)[] = [];
let revision = 0;

export function subscribeI18n(listener: () => void) {
  listeners.push(listener);
  return () => {
    listeners = listeners.filter((l) => l !== listener);
  };
}

function getSnapshot() {
  return revision;
}

export function notifyI18nChange() {
  revision++;
  for (const l of listeners) l();
}

export function useT() {
  useSyncExternalStore(subscribeI18n, getSnapshot);
}
