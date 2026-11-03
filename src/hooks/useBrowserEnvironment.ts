"use client";

import { useState, useEffect, createContext, useContext } from "react";

export const ServerUserAgentContext = createContext<string>("");

export type BrowserCompatibilityState =
  | "edge_ready"
  | "edge_no_coop"
  | "other_with_coop"
  | "other_no_coop"
  | "mobile";

export interface BrowserEnvironment {
  mounted: boolean;
  isMobile: boolean;
  isEdge: boolean;
  hasCOOP_COEP: boolean;
  state: BrowserCompatibilityState;
}

export function detectBrowserEnvironment(
  ua: string,
  innerWidth: number,
  isCoarse: boolean,
  crossOriginIsolated?: boolean
): { isMobile: boolean; isEdge: boolean; hasCOOP_COEP: boolean; state: BrowserCompatibilityState } {
  const mobileUA = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua);
  const isSmall = innerWidth > 0 && innerWidth < 768;
  const isMobile = mobileUA || isSmall || isCoarse;

  // Modern Chromium Edge user agent contains 'edg/'
  const isEdge = /edg\//i.test(ua);
  const hasCOOP_COEP = Boolean(crossOriginIsolated);

  let state: BrowserCompatibilityState;
  if (isMobile) {
    state = "mobile";
  } else if (isEdge && hasCOOP_COEP) {
    state = "edge_ready";
  } else if (isEdge && !hasCOOP_COEP) {
    state = "edge_no_coop";
  } else if (!isEdge && hasCOOP_COEP) {
    state = "other_with_coop";
  } else {
    state = "other_no_coop";
  }

  return { isMobile, isEdge, hasCOOP_COEP, state };
}

export function useBrowserEnvironment(): BrowserEnvironment {
  const serverUA = useContext(ServerUserAgentContext);

  const [env, setEnv] = useState<BrowserEnvironment>(() => {
    if (serverUA) {
      const initial = detectBrowserEnvironment(serverUA, 1920, false, true);
      return {
        mounted: true,
        ...initial,
      };
    }
    return {
      mounted: false,
      isMobile: false,
      isEdge: false,
      hasCOOP_COEP: false,
      state: "mobile",
    };
  });

  useEffect(() => {
    if (typeof window === "undefined") return;

    const compute = () => {
      const ua = navigator.userAgent || "";
      const isCoarse = window.matchMedia ? window.matchMedia("(pointer: coarse)").matches : false;
      const coi = Boolean(window.crossOriginIsolated);
      const res = detectBrowserEnvironment(ua, window.innerWidth, isCoarse, coi);

      setEnv({
        mounted: true,
        ...res,
      });
    };

    compute();

    window.addEventListener("resize", compute);
    return () => window.removeEventListener("resize", compute);
  }, []);

  return env;
}
