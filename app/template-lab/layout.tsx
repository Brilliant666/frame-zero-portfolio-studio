import type { Metadata } from "next";
import labChromeCss from "./_components/lab-chrome.module.css?inline";
import { createInlineCssModule } from "./_lib/inline-css-module";
import templateLabCss from "./template-lab.module.css?inline";

const styles = createInlineCssModule(templateLabCss);

export const metadata: Metadata = {
  title: "FRAME//ZERO Template Lab",
  description: "Isolated, non-persistent photography layout experiments for design review.",
  robots: {
    index: false,
    follow: false,
    nocache: true,
  },
};

export default function TemplateLabLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <>
      <style data-template-lab-style="shell">{templateLabCss}</style>
      <style data-template-lab-style="chrome">{labChromeCss}</style>
      <div className={styles.labBoundary}>{children}</div>
    </>
  );
}
