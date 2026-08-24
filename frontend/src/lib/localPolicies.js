/**
 * SkyVerdict's contract has no "list all policies for an address" view —
 * by design, keeping storage lean (see docs/TRD.md). "My Policies" is
 * therefore tracked client-side: every policy id this browser has created
 * or explicitly added is remembered in localStorage. This never stands in
 * as a source of truth for a policy's status — every read still goes
 * straight to the contract — it only remembers which ids to ask about.
 */
const KEY = "skyverdict:tracked-policy-ids";

export function getTrackedPolicyIds() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const ids = JSON.parse(raw);
    return Array.isArray(ids) ? ids : [];
  } catch {
    return [];
  }
}

export function trackPolicyId(id) {
  const idNum = Number(id);
  if (!Number.isFinite(idNum) || idNum <= 0) return;
  const ids = getTrackedPolicyIds();
  if (!ids.includes(idNum)) {
    ids.push(idNum);
    localStorage.setItem(KEY, JSON.stringify(ids));
  }
}

export function untrackPolicyId(id) {
  const idNum = Number(id);
  const ids = getTrackedPolicyIds().filter((x) => x !== idNum);
  localStorage.setItem(KEY, JSON.stringify(ids));
}
