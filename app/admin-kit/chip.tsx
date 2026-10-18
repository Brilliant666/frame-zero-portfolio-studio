import type { ReactNode } from "react";
import styles from "./admin-kit.module.css";

export function Chip({ tone, children }: { tone?: "live" | "draft"; children: ReactNode }) {
  return <span className={styles.chip} data-tone={tone}>{children}</span>;
}
