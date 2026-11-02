"use client";

import { useCallback, type Key } from "react";
import type { TemplateId } from "../catalog";
import { templateAppearances } from "../appearance";
import TemplateRenderer from "../template-renderer";
import type { TemplateProps } from "../types";
import Lightbox from "./lightbox";
import type { useTemplateInteractions } from "./use-template-interactions";

type BasicTemplateHostProps = Omit<TemplateProps, "copiedKey" | "onCopy" | "onBeforeViewChange" | "onOpenWork"> & {
  interactions?: ReturnType<typeof useTemplateInteractions>;
  rendererKey?: Key;
  lightboxTemplate?: TemplateId;
};

const ignoreCopy = async () => {};
const ignoreOpen = () => {};

export default function BasicTemplateHost({ interactions, rendererKey, lightboxTemplate, ...props }: BasicTemplateHostProps) {
  const setActiveWork = interactions?.setActiveWork;
  const closeActiveWork = useCallback(() => setActiveWork?.(null), [setActiveWork]);
  return <>
    <TemplateRenderer key={rendererKey} {...props}
      copiedKey={interactions?.copiedKey ?? null}
      onCopy={interactions?.copyText ?? ignoreCopy}
      onBeforeViewChange={closeActiveWork}
      onOpenWork={interactions?.openWork ?? ignoreOpen} />
    {interactions?.activeWork && <Lightbox
      theme={props.templateId === "polaroid-field" ? "light" : "dark"}
      appearance={templateAppearances[props.templateId].tone}
      basicTemplate={lightboxTemplate}
      work={interactions.activeWork} works={[...interactions.lightboxWorks]}
      frameRef={interactions.lightboxRef} closeButtonRef={interactions.closeButtonRef}
      onMove={interactions.moveActiveWork} onClose={() => interactions.setActiveWork(null)} />}
  </>;
}
