"use client";

/* eslint-disable @next/next/no-img-element -- option thumbnails are Site-owned image variants. */
import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import styles from "./admin-kit.module.css";

export type SelectOption<V extends string = string> = {
  value: V;
  label: string;
  description?: string;
  /** Image shown before the label (e.g. a photo variant). */
  thumb?: string;
  /** Small colour dot shown before the label (e.g. a template accent). */
  color?: string;
  /** Short trailing status text, e.g. 公开中. */
  chip?: ReactNode;
  disabled?: boolean;
  /** Options sharing a group are listed under one heading. */
  group?: string;
};

type Props<V extends string> = {
  value: V | null;
  options: readonly SelectOption<V>[];
  onChange: (value: V) => void;
  /** Accessible name. Always given, so a wrapping label's text never leaks into the name. */
  label: string;
  placeholder?: string;
  disabled?: boolean;
  size?: "default" | "compact";
  /** Minimum popover width in px; the popover never narrows below the trigger. */
  minWidth?: number;
  className?: string;
  /** Rendered after the selected option inside the trigger (e.g. a status chip). */
  trailing?: ReactNode;
  id?: string;
};

/**
 * Select-only combobox (WAI-ARIA APG): focus stays on the trigger and the active option is
 * exposed through aria-activedescendant. The listbox is portalled so dialogs, sticky bars
 * and scroll panes never clip it.
 */
export function Select<V extends string>({ value, options, onChange, label, placeholder = "请选择", disabled, size = "default", minWidth = 200, className, trailing, id }: Props<V>) {
  const generated = useId(), baseId = id ?? `select${generated.replace(/:/g, "")}`;
  const listId = `${baseId}-list`;
  const trigger = useRef<HTMLButtonElement>(null), list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [position, setPosition] = useState<{ left: number; top: number; width: number; maxHeight: number } | null>(null);
  // Inside a modal <dialog> everything outside the top layer is inert, so the listbox must live in it.
  const [host, setHost] = useState<HTMLElement | null>(null);
  const typed = useRef({ text: "", at: 0 });
  const selectedIndex = options.findIndex(option => option.value === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : null;
  const enabled = (index: number) => index >= 0 && index < options.length && !options[index].disabled;
  const step = (from: number, delta: 1 | -1) => {
    for (let index = from + delta, guard = 0; guard < options.length; index += delta, guard++) {
      const wrapped = (index + options.length) % options.length;
      if (enabled(wrapped)) return wrapped;
    }
    return from;
  };
  const place = useCallback(() => {
    const box = trigger.current?.getBoundingClientRect();
    if (!box) return;
    const width = Math.min(window.innerWidth - 16, Math.max(box.width, minWidth));
    const left = Math.max(8, Math.min(box.left, window.innerWidth - width - 8));
    const below = window.innerHeight - box.bottom - 12, above = box.top - 12;
    const openUp = below < 220 && above > below;
    const maxHeight = Math.max(160, Math.min(360, openUp ? above : below));
    // Before the list exists its height is estimated from the option count; the layout effect refines it.
    const height = Math.min(maxHeight, list.current?.scrollHeight ?? options.length * 44 + 10);
    setPosition({ left, width, maxHeight, top: openUp ? Math.max(8, box.top - 6 - height) : box.bottom + 6 });
  }, [minWidth, options.length]);
  const show = (index = selectedIndex) => {
    if (disabled) return;
    setActive(enabled(index) ? index : step(-1, 1));
    setHost(trigger.current?.closest("dialog") ?? document.body);
    place();
    setOpen(true);
  };
  const hide = useCallback((restoreFocus = true) => { setOpen(false); setPosition(null); if (restoreFocus) trigger.current?.focus({ preventScroll: true }); }, []);
  const choose = (index: number) => {
    if (!enabled(index)) return;
    hide();
    if (options[index].value !== value) onChange(options[index].value);
  };
  useLayoutEffect(() => { if (open) place(); }, [open, place]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { const target = event.target as Node; if (!trigger.current?.contains(target) && !list.current?.contains(target)) hide(false); };
    // Follow the trigger when the page scrolls or resizes; only close once it has left the screen.
    let frame = 0;
    const follow = (event: Event) => {
      if (list.current?.contains(event.target as Node)) return;
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = trigger.current?.getBoundingClientRect();
        if (!box || box.bottom < 0 || box.top > window.innerHeight) hide(false); else place();
      });
    };
    document.addEventListener("pointerdown", outside, true);
    window.addEventListener("resize", follow); document.addEventListener("scroll", follow, true);
    return () => { cancelAnimationFrame(frame); document.removeEventListener("pointerdown", outside, true); window.removeEventListener("resize", follow); document.removeEventListener("scroll", follow, true); };
  }, [open, hide, place]);
  useEffect(() => {
    // Scroll only the listbox: scrollIntoView would also scroll the page under a fixed popover.
    const box = list.current, option = open && active >= 0 ? box?.querySelector<HTMLElement>(`#${CSS.escape(`${baseId}-o${active}`)}`) : null;
    if (!box || !option) return;
    const top = option.offsetTop, bottom = top + option.offsetHeight;
    if (top < box.scrollTop) box.scrollTop = top - 4;
    else if (bottom > box.scrollTop + box.clientHeight) box.scrollTop = bottom - box.clientHeight + 4;
  }, [open, active, baseId]);
  const keydown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const key = event.key;
    if (!open) {
      if (["ArrowDown", "ArrowUp", "Enter", " "].includes(key)) { event.preventDefault(); show(key === "ArrowUp" && selectedIndex < 0 ? options.length - 1 : selectedIndex); }
      return;
    }
    if (key === "ArrowDown") { event.preventDefault(); setActive(current => step(current, 1)); }
    else if (key === "ArrowUp") { event.preventDefault(); setActive(current => step(current, -1)); }
    else if (key === "Home") { event.preventDefault(); setActive(step(-1, 1)); }
    else if (key === "End") { event.preventDefault(); setActive(step(options.length, -1)); }
    else if (key === "Enter" || key === " ") { event.preventDefault(); choose(active); }
    else if (key === "Escape") { event.preventDefault(); event.stopPropagation(); hide(); }
    else if (key === "Tab") hide(false);
    else if (key.length === 1 && !event.metaKey && !event.ctrlKey) {
      const now = Date.now(); typed.current = { text: (now - typed.current.at > 700 ? "" : typed.current.text) + key.toLowerCase(), at: now };
      const match = options.findIndex((option, index) => enabled(index) && option.label.toLowerCase().startsWith(typed.current.text));
      if (match >= 0) setActive(match);
    }
  };
  const visual = (option: SelectOption<V>) => <>
    {option.thumb && <img className={styles.thumb} src={option.thumb} alt="" loading="lazy" decoding="async" />}
    {option.color && <i className={styles.dot} style={{ background: option.color }} aria-hidden="true" />}
  </>;
  let group: string | undefined;
  return <div className={`${styles.select} ${className ?? ""}`} data-size={size} data-admin-kit="select">
    <button ref={trigger} id={baseId} type="button" role="combobox" aria-label={label} aria-haspopup="listbox" aria-expanded={open} aria-controls={listId}
      aria-activedescendant={open && active >= 0 ? `${baseId}-o${active}` : undefined} data-value={value ?? ""} disabled={disabled}
      onClick={() => open ? hide() : show()} onKeyDown={keydown}>
      {selected ? <>{visual(selected)}<span className={styles.value}>{selected.label}</span></> : <span className={`${styles.value} ${styles.placeholder}`}>{placeholder}</span>}
      {trailing}
      <svg className={styles.chevron} viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    {open && host && createPortal(<div ref={list} id={listId} data-admin-kit="listbox" role="listbox" aria-label={label} className={styles.listbox}
      style={position ? { left: position.left, top: position.top, width: position.width, maxHeight: position.maxHeight } : undefined}>
      {options.map((option, index) => {
        const heading = option.group && option.group !== group ? <div className={styles.group} role="presentation">{option.group}</div> : null;
        group = option.group ?? group;
        return <div key={option.value} role="presentation">{heading}<div id={`${baseId}-o${index}`} role="option" aria-selected={option.value === value} aria-disabled={option.disabled || undefined}
          aria-labelledby={`${baseId}-o${index}-l`} aria-describedby={option.description ? `${baseId}-o${index}-d` : undefined}
          data-value={option.value} data-active={index === active || undefined} className={styles.option}
          onPointerMove={() => { if (enabled(index) && index !== active) setActive(index); }}
          onPointerDown={event => event.preventDefault()} onClick={() => choose(index)}>
          {visual(option)}
          <span className={styles.optionText}><span id={`${baseId}-o${index}-l`}>{option.label}</span>{option.description && <small id={`${baseId}-o${index}-d`}>{option.description}</small>}</span>
          {option.chip}
          <svg className={styles.check} viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12.5 10 17l9-10" /></svg>
        </div></div>;
      })}
    </div>, host)}
  </div>;
}
