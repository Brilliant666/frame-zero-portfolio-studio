import type { PhotographyPackage, SiteContent, Work } from "../site-config";
import type { TemplateId } from "./catalog";

export type TemplateProps = {
  templateId: TemplateId;
  content: SiteContent;
  works: Work[];
  packages: PhotographyPackage[];
  bookingTemplate: string;
  booted: boolean;
  copiedKey: string | null;
  isPreview: boolean;
  onCopy: (value: string, key: string) => Promise<void>;
  onOpenWork: (work: Work) => void;
};
