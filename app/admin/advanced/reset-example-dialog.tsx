"use client";

import { useRef } from "react";
import { useAdmin } from "../admin-provider";
import styles from "../admin-v2.module.css";

export default function ResetExampleDialog() {
  const { resetToExample } = useAdmin();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);

  const openDialog = () => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open) return;
    dialog.showModal();
    window.requestAnimationFrame(() => cancelRef.current?.focus());
  };

  const closeDialog = () => {
    dialogRef.current?.close();
  };

  const confirmReset = () => {
    resetToExample();
    dialogRef.current?.close("confirmed");
  };

  return (
    <>
      <button ref={triggerRef} type="button" className={styles.dangerButton} onClick={openDialog}>
        恢复示例数据
      </button>
      <dialog
        ref={dialogRef}
        className={styles.resetDialog}
        aria-labelledby="reset-example-title"
        aria-describedby="reset-example-description"
        onCancel={(event) => {
          event.preventDefault();
          dialogRef.current?.close();
        }}
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.preventDefault();
          dialogRef.current?.close();
        }}
        onClose={() => triggerRef.current?.focus()}
      >
        <div className={styles.resetDialogBody}>
          <span>危险操作</span>
          <h3 id="reset-example-title">确认替换当前草稿？</h3>
          <p id="reset-example-description">
            这会用仓库内的示例内容替换当前草稿，当前未保存修改会丢失。操作不会立即写入数据库，只有之后明确点击“保存”才会持久化。
          </p>
          <div className={styles.resetDialogActions}>
            <button ref={cancelRef} type="button" onClick={closeDialog}>取消，保留草稿</button>
            <button type="button" className={styles.confirmDanger} onClick={confirmReset}>确认恢复示例草稿</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
