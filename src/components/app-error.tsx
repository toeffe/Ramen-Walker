import type { ErrorComponentProps } from "@tanstack/react-router";

export function AppErrorComponent({ error }: ErrorComponentProps) {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 bg-rw-bg px-6 text-center text-rw-fg">
      <h1 className="font-display text-2xl">The road broke</h1>
      <p className="max-w-md text-sm break-words text-rw-muted">
        {error.message || "Reload and walk again."}
      </p>
    </main>
  );
}
