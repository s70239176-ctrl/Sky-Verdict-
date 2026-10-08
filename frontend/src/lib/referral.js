// Partner referral + widget deep-link handling.
// A link like  https://sky-verdicts.vercel.app/?ref=0xPARTNER&airline=AA&flight=100&from=JFK&dep=...&arr=...
// stores the referrer (so it survives navigation) and pre-fills the buy form.

const KEY = "skyverdict.ref";
const ADDR = /^0x[0-9a-fA-F]{40}$/;

export function isAddress(v) {
  return ADDR.test(String(v || ""));
}

export function rememberReferrer(ref) {
  try {
    if (isAddress(ref)) localStorage.setItem(KEY, ref);
  } catch { /* storage may be blocked; referral just won't persist */ }
}

export function getReferrer() {
  try {
    const v = localStorage.getItem(KEY);
    return isAddress(v) ? v : null;
  } catch {
    return null;
  }
}

/** Parse the page URL once. Returns { ref, prefill|null }. */
export function readDeepLink(search = typeof window !== "undefined" ? window.location.search : "") {
  const q = new URLSearchParams(search);
  const ref = q.get("ref");
  if (isAddress(ref)) rememberReferrer(ref);
  const airline = q.get("airline");
  const flight = q.get("flight");
  const prefill = airline && flight
    ? {
        airlineCode: airline.toUpperCase(),
        flightNumber: flight,
        departureAirport: (q.get("from") || "").toUpperCase(),
        scheduledDepartureUtc: q.get("dep") || "",
        scheduledArrivalUtc: q.get("arr") || "",
      }
    : null;
  return { ref: isAddress(ref) ? ref : null, prefill };
}

export function buildLink(origin, { ref, airline, flight, from, dep, arr }) {
  const q = new URLSearchParams();
  if (ref) q.set("ref", ref);
  if (airline) q.set("airline", airline);
  if (flight) q.set("flight", flight);
  if (from) q.set("from", from);
  if (dep) q.set("dep", dep);
  if (arr) q.set("arr", arr);
  return `${origin}/?${q.toString()}`;
}
