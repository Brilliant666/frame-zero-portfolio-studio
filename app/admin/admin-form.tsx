"use client";

import type { ReactNode } from "react";
import { useAdmin } from "./admin-provider";
import styles from "./admin-v2.module.css";

export function AdminSection({
  eyebrow,
  title,
  description,
  children,
}: Readonly<{
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}>) {
  const { busy } = useAdmin();
  const headingId = `admin-${eyebrow.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-heading`;

  return (
    <section className={styles.section} aria-labelledby={headingId} aria-busy={busy}>
      <header className={styles.sectionHeader}>
        <div>
          <span>{eyebrow}</span>
          <h2 id={headingId}>{title}</h2>
        </div>
        <p>{description}</p>
      </header>
      <fieldset className={styles.sectionFieldset} disabled={busy}>
        <legend className="sr-only">{title}</legend>
        {children}
      </fieldset>
    </section>
  );
}

export function FormGroup({
  title,
  description,
  children,
}: Readonly<{
  title: string;
  description?: string;
  children: ReactNode;
}>) {
  return (
    <section className={styles.formGroup}>
      <div className={styles.formGroupHeader}>
        <h3>{title}</h3>
        {description ? <p>{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function AdminField({
  label,
  value,
  onChange,
  area = false,
  placeholder,
  help,
}: Readonly<{
  label: string;
  value: string;
  onChange: (value: string) => void;
  area?: boolean;
  placeholder?: string;
  help?: string;
}>) {
  return (
    <label className={styles.field}>
      <span>{label}</span>
      {area ? (
        <textarea value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      ) : (
        <input value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
      )}
      {help ? <small>{help}</small> : null}
    </label>
  );
}

export function AdminToggle({
  checked,
  onChange,
  label,
}: Readonly<{
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}>) {
  return (
    <label className={styles.toggle}>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span aria-hidden="true" />
      <strong>{label}</strong>
    </label>
  );
}
