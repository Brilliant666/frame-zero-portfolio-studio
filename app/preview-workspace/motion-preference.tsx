"use client";

import { createContext, useContext } from "react";

export const StarMotionContext = createContext({ paused: false, toggle: () => {} });
export const useStarMotion = () => useContext(StarMotionContext);
