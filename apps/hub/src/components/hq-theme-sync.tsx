"use client";
import { useEffect } from "react";

/**
 * Day or night for pages the browser renders itself.
 *
 * The root layout's head script sets the remembered theme before first paint.
 * Next's error shell (a not-found raised while the page renders, for example)
 * is rendered by React in the browser instead, and a script React inserts
 * never runs, so this applies the same choice once the page mounts.
 */
export function HqThemeSync() {
  useEffect(() => {
    const root = document.documentElement;
    if (root.dataset.theme) return;
    try {
      root.dataset.theme =
        localStorage.getItem("hq-theme") ??
        (matchMedia("(prefers-color-scheme: dark)").matches ? "night" : "day");
    } catch {}
  }, []);
  return null;
}
