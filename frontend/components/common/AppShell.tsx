"use client";

import type { ReactNode } from "react";
import { AppProvider, useApp } from "@/lib/store";
import { NavBar } from "@/components/common/NavBar";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";

// Global destructive-action dialog, driven by the shared store so it works from
// either page.
function GlobalConfirm() {
  const { pending, confirmBusy, confirmAction, cancelConfirm } = useApp();
  return (
    <ConfirmDialog
      open={pending !== null}
      loading={confirmBusy}
      title={pending?.kind === "reset" ? "Reset workspace?" : "Delete this document?"}
      body={
        pending?.kind === "reset" ? (
          <>
            This permanently removes all uploaded documents and their indexed
            content. This cannot be undone.
          </>
        ) : pending?.kind === "delete" ? (
          <>
            <span className="font-medium text-navy-700">{pending.doc.filename}</span> and
            its indexed content will be removed.
          </>
        ) : null
      }
      confirmLabel={pending?.kind === "reset" ? "Reset" : "Delete"}
      onConfirm={() => void confirmAction()}
      onCancel={cancelConfirm}
    />
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <AppProvider>
      <div className="flex min-h-screen flex-col">
        <NavBar />
        <main className="flex-1">{children}</main>
      </div>
      <GlobalConfirm />
    </AppProvider>
  );
}
