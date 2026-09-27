"use client";
import { createContext, useContext } from "react";
/** Explicit authorized resource map; null preserves legacy resolution. */
export const PlatformAssetContext = createContext<ReadonlyMap<string, string> | null>(null);
export const usePlatformAssets = () => useContext(PlatformAssetContext);
