import { useSyncExternalStore } from 'react';

/**
 * Tiny store for the measured frame rate. The scene writes to it a couple of
 * times per second and only the label that displays it re-renders.
 */
let currentFps = 0;
const listeners = new Set<() => void>();

export const fpsStore = {
  get: () => currentFps,
  set(fps: number) {
    if (fps === currentFps) return;
    currentFps = fps;
    for (const listener of listeners) listener();
  },
  subscribe(listener: () => void) {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },
};

/** Latest measured frames per second (0 until the first measure). */
export function useFps(): number {
  return useSyncExternalStore(fpsStore.subscribe, fpsStore.get);
}
