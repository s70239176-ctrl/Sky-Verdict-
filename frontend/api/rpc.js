/**
 * Server-side proxy to the GenLayer RPC endpoint.
 *
 * Why this exists: hosted GenLayer Studio's API (https://studio.genlayer.com/api)
 * appears to be built for same-origin use by its own web IDE, not as a public
 * CORS-enabled RPC for third-party browser apps — calling it directly from a
 * deployed frontend on a different origin fails with a browser-only
 * `TypeError: Failed to fetch` (no CORS headers, so the browser blocks it
 * before any response body is even readable). See docs/genvm-gotchas.md #7.
 *
 * Server-to-server requests aren't subject to CORS at all, so this function
 * just forwards the exact JSON-RPC body Vercel receives to the real target
 * and relays the response back verbatim.
 *
 * GENLAYER_RPC_TARGET is a server-side env var (no VITE_ prefix — never
 * exposed to the browser bundle) so the upstream target can be changed
 * (e.g. to Testnet Bradbury later) without touching frontend code.
 */
export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed — this proxy only forwards JSON-RPC POSTs." });
    return;
  }

  const target = process.env.GENLAYER_RPC_TARGET || "https://studio.genlayer.com/api";

  try {
    const upstream = await fetch(target, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req.body),
    });
    const text = await upstream.text();
    if (upstream.ok) {
      // Log JSON-RPC-level errors even on a 200 HTTP response, since those
      // are invisible in the Network tab's status column otherwise —
      // JSON-RPC puts application errors in the body, not the HTTP status.
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error) {
          console.error(
            "[rpc proxy] upstream returned a JSON-RPC error for request:",
            JSON.stringify(req.body)?.slice(0, 800),
            "\n->",
            parsed.error
          );
        }
      } catch {
        // non-JSON body — nothing more to log
      }
    }
    res.status(upstream.status);
    res.setHeader("Content-Type", "application/json");
    res.send(text);
  } catch (err) {
    res.status(502).json({
      error: "Couldn't reach the upstream GenLayer RPC from the proxy.",
      detail: String(err),
    });
  }
}
