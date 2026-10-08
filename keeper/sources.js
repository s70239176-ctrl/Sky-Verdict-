// Pure helpers for the keeper: which tracker pages to hand to evaluate_claim.
// Kept dependency-free so they can be unit-tested with `node --test`.

// IATA -> ICAO airline designators FlightAware uses in its URLs
// (e.g. AA100 lives at /live/flight/AAL100). Extend as needed; an airline
// missing here falls back to the IATA code, which FlightAware often accepts.
export const ICAO = {
  AA: "AAL", DL: "DAL", UA: "UAL", WN: "SWA", B6: "JBU", AS: "ASA",
  BA: "BAW", LH: "DLH", AF: "AFR", KL: "KLM", EK: "UAE", QR: "QTR",
  AC: "ACA", NK: "NKS", F9: "FFT", VS: "VIR", IB: "IBE", TK: "THY",
};

/** "DL202" or "202" (with airline "DL") -> "202" */
export function bareNumber(airline, flightNumber) {
  const a = String(airline || "").toUpperCase();
  const f = String(flightNumber || "").toUpperCase().replace(/\s+/g, "");
  return f.startsWith(a) ? f.slice(a.length) : f;
}

/**
 * Two independent providers, https only, distinct hosts — the exact shape the
 * contract's allowlist and independence checks require. flightradar24 is
 * deliberately excluded: its URL scheme has failed to render in testing.
 */
export function sourceUrlsFor(policy) {
  const airline = String(policy.airline_code).toUpperCase();
  const num = bareNumber(airline, policy.flight_number);
  return [
    `https://www.flightaware.com/live/flight/${ICAO[airline] || airline}${num}`,
    `https://www.flightstats.com/v2/flight-tracker/${airline}/${num}`,
  ];
}

/** Decide whether a queued policy is worth a transaction right now. */
export function shouldSettle(policy, nowSec, settledOrFailed, bufferSec = 3 * 3600) {
  if (settledOrFailed.has(policy.policy_id)) return false;
  return policy.status === "ACTIVE" && nowSec >= Number(policy.scheduled_arrival_utc) + bufferSec;
}

/** A PROVISIONAL verdict whose challenge window has closed can be finalized by anyone. */
export function shouldFinalize(policy, nowSec, handled) {
  if (handled.has("f" + policy.policy_id)) return false;
  return policy.status === "PROVISIONAL" && nowSec >= Number(policy.challenge_deadline_utc);
}
