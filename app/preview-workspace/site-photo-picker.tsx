"use client";

import { useEffect, useRef, type RefObject } from "react";
import type { SiteAsset } from "../site-editor/assets-client";
import PhotoLibrary, { type LibraryAlbum } from "../admin-kit/photo-library";
import styles from "./site-photo-picker.module.css";

type Props = {
  noun: "图集" | "分类";
  /** The album being filled; its photos stay visible but cannot be picked again. */
  target: LibraryAlbum;
  /** Every album of the space, for the membership badges and filters. */
  albums: readonly LibraryAlbum[];
  assets: readonly SiteAsset[];
  ready: boolean; truncated: boolean; state: string; onReload: () => Promise<boolean | undefined | void>;
  /** Appends in pick order and returns the ids added; the parent closes the picker. Failures must throw. */
  onAdd: (ids: readonly string[]) => readonly string[];
  onClose: () => void;
  uploadEndpoint?: string;
  editable?: boolean;
  returnFocus?: RefObject<HTMLButtonElement | null>;
};

/** "从图库选片": the library grid in a dialog, picking for one album. */
export default function SitePhotoPicker({ noun, target, albums, assets, ready, truncated, state, onReload, onAdd, onClose, uploadEndpoint, editable, returnFocus }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const selectedCount = useRef(0);
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusTarget = returnFocus?.current ?? previous;
    node?.showModal();
    return () => { node?.close(); focusTarget?.focus({ preventScroll: true }); };
  }, [returnFocus]);
  const close = () => { if (!selectedCount.current || window.confirm(`放弃本次选片？已加入${noun}的照片和其他编辑不变。`)) onClose(); };
  return <dialog ref={dialog} className={styles.dialog} aria-label="从图库选片" onCancel={event => { event.preventDefault(); if (event.target === event.currentTarget) close(); }}>
    <PhotoLibrary noun={noun} target={target} albums={albums} assets={assets} ready={ready} truncated={truncated} state={state} onReload={onReload} editable={editable}
      uploadEndpoint={uploadEndpoint} onAdd={(_, ids) => onAdd(ids)} onCancel={close} onSelectionChange={count => { selectedCount.current = count; }} />
  </dialog>;
}
