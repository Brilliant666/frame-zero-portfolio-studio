import styles from "./admin-v2.module.css";

export default function AdminSectionPlaceholder({
  title,
  description,
}: Readonly<{
  title: string;
  description: string;
}>) {
  return (
    <section className={styles.placeholder} aria-labelledby="admin-section-placeholder">
      <div>
        <h2 id="admin-section-placeholder">{title}</h2>
        <p>{description}</p>
      </div>
    </section>
  );
}
