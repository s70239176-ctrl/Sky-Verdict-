import React from "react";

export default function EmptyState({ title, body, action }) {
  return (
    <div className="flex flex-col items-center gap-3 border border-dashed rule px-6 py-16 text-center">
      <p className="font-mono text-sm font-medium text-ivory">{title}</p>
      {body && <p className="max-w-sm text-sm text-ivory-soft/60">{body}</p>}
      {action}
    </div>
  );
}
