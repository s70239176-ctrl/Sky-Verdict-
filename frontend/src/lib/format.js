export function shortAddress(addr) {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export function formatGen(wei) {
  // BigInt, not Number — a wei-scale value (18 decimals) can easily
  // exceed Number.MAX_SAFE_INTEGER (~9 quadrillion) and silently lose
  // precision if parsed as a plain JS number. This still displays raw
  // wei (matching what the contract actually stores and what's been
  // verified end-to-end throughout this project) — it just does so
  // accurately at any scale, small test amounts or large ones alike.
  let big;
  try {
    big = BigInt(typeof wei === "string" ? wei : Math.trunc(Number(wei)));
  } catch {
    return "—";
  }
  return `${big.toLocaleString()} GEN wei`;
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
  // Verdict resolved PAYOUT, but the shared pool didn't have enough
  // liquidity to cover the full entitled amount at settlement time — the
  // holder received a real transfer, just less than they were entitled to.
  // Kept visually distinct from plain PAID so this is never mistaken for a
  // full settlement.
  PAID_PARTIAL: { label: "Settled — partial payout", color: "text-amber", dot: "bg-amber", verb: "PARTIAL PAYOUT" },
  EXPIRED_NO_PAYOUT: { label: "Verified — no payout", color: "text-green", dot: "bg-green", verb: "ON TIME" },
  REFUNDED: { label: "Refunded", color: "text-ivory-soft/70", dot: "bg-ivory-soft/40", verb: "REFUNDED" },
  // Same shortfall concept as PAID_PARTIAL, on the claim_refund path.
  REFUNDED_PARTIAL: { label: "Refunded — partial", color: "text-amber", dot: "bg-amber", verb: "PARTIAL REFUND" },
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
