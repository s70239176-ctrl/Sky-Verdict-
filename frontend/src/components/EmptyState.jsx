import React from "react";

export default function EmptyState({ title, body, action }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-grid px-6 py-14 text-center">
      <p className="font-mono text-sm font-medium text-ink-primary">{title}</p>
      {body && <p className="max-w-sm text-sm text-ink-dim">{body}</p>}
      {action}
    </div>
  );
}
