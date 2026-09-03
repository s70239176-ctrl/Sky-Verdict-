// Mirrors SkyVerdict.py's _canonical_host / evaluate_claim independence
// check, purely so the UI can catch obviously-doomed submissions (a
// duplicate provider, a non-https URL) before spending gas on a
// transaction the contract will revert anyway. This is a UX convenience
// ONLY — the contract is the real enforcement boundary, and this must
// never be treated as a substitute for it (e.g. it doesn't know the
// live on-chain allowlist, so an unlisted-but-well-formed host will
// still pass this check and only get rejected on-chain).

export function canonicalHost(url) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:") return null;
  let host = parsed.hostname.toLowerCase();
  if (host.startsWith("www.")) host = host.slice(4);
  return host || null;
}

/**
 * Validates a list of source URLs the same way evaluate_claim/appeal
 * will: each must be a well-formed https:// URL, and no two may resolve
 * to the same canonical host. Returns { ok, error } — error is a
 * human-readable string naming the first problem found, or null if ok.
 */
export function validateSourceUrls(urls) {
  const nonEmpty = urls.map((u) => u.trim()).filter(Boolean);
  const seen = new Set();
  for (const url of nonEmpty) {
    const host = canonicalHost(url);
    if (!host) {
      return { ok: false, error: `"${url}" isn't a valid https:// URL.` };
    }
    if (seen.has(host)) {
      return {
        ok: false,
        error: `More than one source resolves to "${host}" — sources must be from distinct providers.`,
      };
    }
    seen.add(host);
  }
  return { ok: true, error: null };
}
