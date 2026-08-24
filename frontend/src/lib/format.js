export function shortAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatGen(wei) {
  const n = Number(wei);
  if (!Number.isFinite(n)) return "—";
  return `${n.toLocaleString()} GEN wei`;
}

export function formatUnixUtc(ts) {
  const n = Number(ts);
  if (!n) return "—";
  const d = new Date(n * 1000);
  return d.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function minutesToHuman(min) {
  const n = Number(min);
  if (!Number.isFinite(n)) return "—";
  const h = Math.floor(n / 60);
  const m = n % 60;
  if (h === 0) return `${m}m`;
  return `${h}h ${m}m`;
}

export const STATUS_META = {
  ACTIVE: { label: "Active", color: "text-cyan", dot: "bg-cyan" },
  PAID: { label: "Paid out", color: "text-amber", dot: "bg-amber" },
  EXPIRED_NO_PAYOUT: { label: "Expired — no payout", color: "text-ink-dim", dot: "bg-ink-faint" },
  REFUNDED: { label: "Refunded", color: "text-ink-dim", dot: "bg-ink-faint" },
  INDETERMINATE: { label: "Awaiting appeal", color: "text-signal-red", dot: "bg-signal-red" },
};

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || "Unknown", color: "text-ink-dim", dot: "bg-ink-faint" };
}
