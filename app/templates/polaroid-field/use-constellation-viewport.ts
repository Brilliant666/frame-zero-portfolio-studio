"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { constrainView, fitRectsToViewport, focusRectInViewport, getMinimumScale, getRotatedBounds, withDecorationMargin, type ViewportFit, type ViewState } from "./viewport-fit";

const INITIAL_VIEW: ViewState = { x: 0, y: 0, scale: 1 };
const PREFERRED_MIN_SCALE = .72;
const MAX_SCALE = 1.28;
type Mode = "focus" | "overview" | "readable";
type Drag = { pointerId: number; startX: number; startY: number; originX: number; originY: number; horizontalOnly: boolean };

export type ConstellationViewportOptions = {
  viewportRef: RefObject<HTMLDivElement | null>;
  canvasRef: RefObject<HTMLDivElement | null>;
  layoutKey: unknown;
  getFocusIndex?: () => number;
  initialMode?: Mode;
  enabled?: boolean;
  mobileEnabled?: boolean;
  /** Canvas-space room to the left of the photos for an in-scene identity. */
  reserveLeft?: number;
  initialView?: ViewState;
  onViewChange?: (view: ViewState) => void;
  /** Optional local first-look group for large saved photo compositions. */
  readableGroupSize?: number;
  decorationMargin?: number;
};

/** Shared camera for the original nine-photo field and temporary collection scenes. */
export function useConstellationViewport({ viewportRef, canvasRef, layoutKey, getFocusIndex, initialMode = "focus", enabled = true, mobileEnabled = false, reserveLeft = 0, initialView, onViewChange, readableGroupSize, decorationMargin = 0 }: ConstellationViewportOptions) {
  const callbacks = useRef({ getFocusIndex, onViewChange });
  useLayoutEffect(() => { callbacks.current = { getFocusIndex, onViewChange }; });
  const viewRef = useRef<ViewState>(initialView ?? INITIAL_VIEW);
  const fitRef = useRef<ViewportFit | null>(null);
  const modeRef = useRef<Mode | "manual">(initialView ? "manual" : initialMode);
  const minimumRef = useRef(PREFERRED_MIN_SCALE);
  const frameRef = useRef<number | null>(null);
  const dragRef = useRef<Drag | null>(null);
  const [view, setView] = useState<ViewState>(initialView ?? INITIAL_VIEW);
  const [minimumScale, setMinimumScale] = useState(PREFERRED_MIN_SCALE);
  const [dragging, setDragging] = useState(false);
  const [desktopFieldEnabled, setDesktopFieldEnabled] = useState(false);
  const [sceneMode, setSceneMode] = useState<"focus" | "overview">(initialMode === "focus" ? "focus" : "overview");

  const publish = useCallback((next: ViewState) => {
    setView(next);
    callbacks.current.onViewChange?.(next);
  }, []);
  const commitView = useCallback((next: ViewState) => {
    if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
    frameRef.current = null;
    viewRef.current = next;
    publish(next);
  }, [publish]);
  const scheduleView = useCallback((next: ViewState) => {
    viewRef.current = next;
    if (frameRef.current !== null) return;
    frameRef.current = window.requestAnimationFrame(() => {
      frameRef.current = null;
      publish(viewRef.current);
    });
  }, [publish]);
  const updateFitGeometry = useCallback(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !viewport || !canvas || (!mobileEnabled && !window.matchMedia("(min-width: 801px)").matches)) return null;
    const cards = Array.from(canvas.querySelectorAll<HTMLElement>("[data-polaroid]"), (card) => withDecorationMargin({
      left: card.offsetLeft, top: card.offsetTop, width: card.offsetWidth, height: card.offsetHeight,
      rotation: Number.parseFloat(card.dataset.rotation ?? "0"),
    }, decorationMargin));
    const bounds = cards.map(getRotatedBounds);
    const safeReserve = Number.isFinite(reserveLeft) ? Math.max(0, reserveLeft) : 0;
    const left = bounds.length ? Math.min(...bounds.map((card) => card.left)) : 0;
    const top = bounds.length ? Math.min(...bounds.map((card) => card.top)) : 0;
    const bottom = bounds.length ? Math.max(...bounds.map((card) => card.bottom)) : 0;
    const fitRects = safeReserve > 0 && cards.length
      ? [...cards, { left: left - safeReserve, top, width: safeReserve, height: bottom - top, rotation: 0 }]
      : cards;
    const heading = decorationMargin && viewport.dataset.home === "false" ? viewport.previousElementSibling as HTMLElement : null;
    const inset = heading ? Math.max(72, heading.offsetHeight + 16) : 32;
    const fit = fitRectsToViewport({ width: viewport.clientWidth, height: viewport.clientHeight }, { width: canvas.offsetWidth, height: canvas.offsetHeight }, fitRects, inset);
    const focus = cards[callbacks.current.getFocusIndex?.() ?? 4] ?? cards[0];
    if (!fit || !focus) return null;
    fitRef.current = fit;
    minimumRef.current = getMinimumScale(fit.view.scale, PREFERRED_MIN_SCALE);
    setMinimumScale((current) => Math.abs(current - minimumRef.current) < .0001 ? current : minimumRef.current);
    const start = Math.max(0, Math.min(cards.length - 3, cards.indexOf(focus) - 1));
    const group = readableGroupSize === 3 ? cards.slice(start, start + 3) : readableGroupSize ? [...cards].sort((a, b) => {
      const distance = (card: typeof focus) => Math.hypot(card.left + card.width / 2 - focus.left - focus.width / 2, card.top + card.height / 2 - focus.top - focus.height / 2);
      return distance(a) - distance(b);
    }).slice(0, readableGroupSize) : [];
    const readableFit = group.length ? fitRectsToViewport(fit.viewport, fit.canvas, group, 40) : null;
    return { fit, focus, readableFit };
  }, [canvasRef, enabled, mobileEnabled, reserveLeft, viewportRef, readableGroupSize, decorationMargin]);
  const constrain = useCallback((next: ViewState) => fitRef.current ? constrainView(next, fitRef.current, minimumRef.current, MAX_SCALE) : next, []);
  const showOverview = useCallback(() => {
    const geometry = updateFitGeometry();
    if (!geometry) return;
    modeRef.current = "overview";
    setSceneMode("overview");
    if (geometry) commitView(geometry.fit.view);
  }, [commitView, updateFitGeometry]);
  const showFocus = useCallback(() => {
    const geometry = updateFitGeometry();
    if (!geometry) return;
    modeRef.current = "focus";
    setSceneMode("focus");
    if (geometry) commitView(focusRectInViewport(geometry.fit, geometry.focus, minimumRef.current, MAX_SCALE));
  }, [commitView, updateFitGeometry]);

  useLayoutEffect(() => {
    const viewport = viewportRef.current;
    const canvas = canvasRef.current;
    if (!enabled || !viewport || !canvas) return;
    const desktopQuery = window.matchMedia("(min-width: 801px)");
    let resizeFrame: number | null = null;
    const recompute = () => {
      resizeFrame = null;
      const geometry = updateFitGeometry();
      if (!geometry) return;
      if (modeRef.current === "focus") commitView(focusRectInViewport(geometry.fit, geometry.focus, minimumRef.current, MAX_SCALE));
      else if (modeRef.current === "overview") commitView(geometry.fit.view);
      else if (modeRef.current === "readable") {
        if (geometry.readableFit) { commitView(constrain(geometry.readableFit.view)); return; }
        const scale = Math.max(geometry.fit.view.scale, .8);
        const ratio = scale / geometry.fit.view.scale;
        commitView(constrain({ x: geometry.fit.view.x * ratio, y: geometry.fit.view.y * ratio, scale }));
      } else commitView(constrain(viewRef.current));
    };
    const schedule = () => { if (resizeFrame === null) resizeFrame = window.requestAnimationFrame(recompute); };
    const mediaChanged = () => { setDesktopFieldEnabled(desktopQuery.matches); schedule(); };
    setDesktopFieldEnabled(desktopQuery.matches);
    recompute();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(schedule);
    observer?.observe(viewport);
    observer?.observe(canvas);
    if (decorationMargin && viewport.previousElementSibling) observer?.observe(viewport.previousElementSibling);
    if (!observer) window.addEventListener("resize", schedule);
    desktopQuery.addEventListener("change", mediaChanged);
    return () => {
      observer?.disconnect();
      if (!observer) window.removeEventListener("resize", schedule);
      desktopQuery.removeEventListener("change", mediaChanged);
      if (resizeFrame !== null) window.cancelAnimationFrame(resizeFrame);
    };
  }, [canvasRef, commitView, constrain, enabled, layoutKey, updateFitGeometry, viewportRef, decorationMargin]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!enabled || !viewport) return;
    const finish = () => {
      const active = dragRef.current;
      dragRef.current = null;
      setDragging(false);
      if (active && viewport.hasPointerCapture(active.pointerId)) viewport.releasePointerCapture(active.pointerId);
    };
    const down = (event: PointerEvent) => {
      const desktop = window.matchMedia("(min-width: 801px)").matches;
      if ((!desktop && !mobileEnabled) || event.button !== 0) return;
      if (event.target instanceof Element && event.target.closest("button, a, input, select, textarea, [data-field-controls]")) return;
      dragRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: viewRef.current.x, originY: viewRef.current.y, horizontalOnly: !desktop && event.pointerType === "touch" };
      viewport.setPointerCapture(event.pointerId);
      if (event.pointerType !== "touch") viewport.focus({ preventScroll: true });
      setDragging(true);
    };
    const move = (event: PointerEvent) => {
      const active = dragRef.current;
      if (!active || active.pointerId !== event.pointerId) return;
      if (!active.horizontalOnly) event.preventDefault();
      modeRef.current = "manual";
      scheduleView(constrain({ ...viewRef.current, x: active.originX + event.clientX - active.startX, y: active.originY + (active.horizontalOnly ? 0 : event.clientY - active.startY) }));
    };
    const end = (event: PointerEvent) => { if (dragRef.current?.pointerId === event.pointerId) finish(); };
    viewport.addEventListener("pointerdown", down);
    viewport.addEventListener("pointermove", move);
    viewport.addEventListener("pointerup", end);
    viewport.addEventListener("pointercancel", end);
    viewport.addEventListener("lostpointercapture", finish);
    return () => {
      viewport.removeEventListener("pointerdown", down);
      viewport.removeEventListener("pointermove", move);
      viewport.removeEventListener("pointerup", end);
      viewport.removeEventListener("pointercancel", end);
      viewport.removeEventListener("lostpointercapture", finish);
      const active = dragRef.current;
      dragRef.current = null;
      if (active && viewport.hasPointerCapture(active.pointerId)) viewport.releasePointerCapture(active.pointerId);
      if (frameRef.current !== null) window.cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    };
  }, [constrain, enabled, mobileEnabled, scheduleView, viewportRef, layoutKey]);

  const zoomBy = useCallback((amount: number) => {
    modeRef.current = "manual";
    commitView(constrain({ ...viewRef.current, scale: viewRef.current.scale + amount }));
  }, [commitView, constrain]);
  const panBy = useCallback((x: number, y: number) => {
    modeRef.current = "manual";
    commitView(constrain({ ...viewRef.current, x: viewRef.current.x + x, y: viewRef.current.y + y }));
  }, [commitView, constrain]);
  const handleFieldKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!enabled || event.target !== event.currentTarget || (!mobileEnabled && !window.matchMedia("(min-width: 801px)").matches)) return;
    const distance = event.shiftKey ? 100 : 42;
    switch (event.key) {
      case "ArrowLeft": event.preventDefault(); panBy(distance, 0); break;
      case "ArrowRight": event.preventDefault(); panBy(-distance, 0); break;
      case "ArrowUp": event.preventDefault(); panBy(0, distance); break;
      case "ArrowDown": event.preventDefault(); panBy(0, -distance); break;
      case "+": case "=": event.preventDefault(); zoomBy(.08); break;
      case "-": event.preventDefault(); zoomBy(-.08); break;
      case "0": case "Home": event.preventDefault(); showOverview(); break;
    }
  };
  return { view, minimumScale, maximumScale: MAX_SCALE, dragging, desktopFieldEnabled, sceneMode, showOverview, showFocus, zoomBy, panBy, handleFieldKeyDown };
}
