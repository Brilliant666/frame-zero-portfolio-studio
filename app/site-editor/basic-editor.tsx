"use client";

import type { ReactNode } from "react";
import { AdminProvider } from "../admin/admin-provider";
import AdminShell from "../admin/admin-shell";
import TemplateEditor from "../admin/template/template-editor";
import ProfileEditor from "../admin/profile/profile-editor";
import PackagesEditor from "../admin/packages/packages-editor";
import ContactEditor from "../admin/contact/contact-editor";
import AdvancedEditor from "../admin/advanced/advanced-editor";
import LayoutWorkspace from "../admin/layout/layout-workspace";
import type { SiteEditorScope } from "./scope";
import { createEmptyBasicContent } from "./content-schema";

const sections = { template: TemplateEditor, profile: ProfileEditor, packages: PackagesEditor, contact: ContactEditor, advanced: AdvancedEditor, layout: LayoutWorkspace };
export type BasicEditorSection = keyof typeof sections;

export default function BasicEditor({ siteScope, section }: { siteScope: SiteEditorScope; section: BasicEditorSection }) {
  return <BasicEditorLayout siteScope={siteScope}><BasicEditorSectionView section={section} /></BasicEditorLayout>;
}

export function BasicEditorSectionView({ section }: { section: BasicEditorSection }) {
  const Editor = sections[section];
  return <Editor />;
}

export function BasicEditorLayout({ siteScope, children }: { siteScope: SiteEditorScope; children: ReactNode }) {
  return <AdminProvider siteScope={siteScope} initialContent={createEmptyBasicContent()} editorLabel="本站基础版独立草稿" localPhotoImportOrigin={null} localPhotoImportState="hosted">
    <AdminShell>{children}</AdminShell>
  </AdminProvider>;
}
