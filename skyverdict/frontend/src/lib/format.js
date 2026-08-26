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
  ACTIVE: { label: "Monitoring", color: "text-orange", dot: "bg-orange", verb: "MONITORING" },
  PAID: { label: "Settled — paid", color: "text-green", dot: "bg-green", verb: "DELAY VERIFIED" },
  EXPIRED_NO_PAYOUT: { label: "Verified — no payout", color: "text-green", dot: "bg-green", verb: "ON TIME" },
  REFUNDED: { label: "Refunded", color: "text-ivory-soft/70", dot: "bg-ivory-soft/40", verb: "REFUNDED" },
  INDETERMINATE: { label: "Awaiting appeal", color: "text-amber", dot: "bg-amber", verb: "NO QUORUM" },
};

export function statusMeta(status) {
  return STATUS_META[status] || { label: status || "Unknown", color: "text-ivory-soft/70", dot: "bg-ivory-soft/40", verb: status || "UNKNOWN" };
}

export const DECISION_META = {
  PAYOUT: { headline: "DELAY VERIFIED", color: "text-green" },
  NO_PAYOUT: { headline: "ON TIME", color: "text-green" },
  NO_QUORUM: { headline: "NO QUORUM", color: "text-amber" },
};

export function decisionMeta(decision) {
  return DECISION_META[decision] || { headline: decision || "PENDING", color: "text-ivory-soft" };
}
