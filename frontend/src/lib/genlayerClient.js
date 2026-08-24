/**
 * Thin wrapper around genlayer-js pointing at the deployed SkyVerdict
 * contract. Two signing paths are supported, matching genlayer-js's own
 * account model (see docs.genlayer.com/api-references/genlayer-js):
 *
 *   1. Browser wallet (MetaMask etc.) — pass just the connected address
 *      string to createClient(); the wallet extension handles signing.
 *   2. Demo account — createAccount() generates a throwaway session key
 *      client-side, so judges/reviewers can try every write path in one
 *      click with zero wallet setup. Clearly labeled as a demo account
 *      everywhere it's used — never presented as a real funded wallet.
 *
 * CONTRACT_ADDRESS / chain come from env vars — see .env.example. Nothing
 * here is hardcoded per-network so this file doesn't change between
 * Studio, Studionet, and Testnet Bradbury.
 */
import { createClient, createAccount } from "genlayer-js";
import * as glChains from "genlayer-js/chains";

const CONTRACT_ADDRESS = import.meta.env.VITE_SKYVERDICT_ADDRESS || "";
const CHAIN_NAME = import.meta.env.VITE_GENLAYER_CHAIN || "studionet";

// "same-origin" is a special sentinel: resolves at runtime to this deployed
// site's own /api/rpc proxy (see api/rpc.js) instead of calling the GenLayer
// RPC directly from the browser, which fails with a CORS-driven
// `TypeError: Failed to fetch` on hosted Studio (see docs/genvm-gotchas.md #7).
// Any other value is used as a literal RPC URL, unchanged.
const RPC_URL_RAW = import.meta.env.VITE_GENLAYER_RPC_URL || undefined;
const RPC_URL =
  RPC_URL_RAW === "same-origin"
    ? typeof window !== "undefined"
      ? `${window.location.origin}/api/rpc`
      : undefined
    : RPC_URL_RAW;

// Namespace import on purpose: genlayer-js's exported chain set has moved
// under us before (see docs/genvm-gotchas.md for the pattern on the Python
// SDK side). A named `import { studionet }` throws a hard SyntaxError and
// crashes the whole app if that export doesn't exist in the installed
// version — this way a missing chain degrades to a clear runtime warning
// and a safe fallback instead of a blank page.
const AVAILABLE_CHAINS = {
  studionet: glChains.studionet,
  testnetAsimov: glChains.testnetAsimov,
  localnet: glChains.localnet,
};

let chain = AVAILABLE_CHAINS[CHAIN_NAME];
if (!chain) {
  const fallbackName = Object.keys(AVAILABLE_CHAINS).find((k) => AVAILABLE_CHAINS[k]);
  chain = fallbackName ? AVAILABLE_CHAINS[fallbackName] : undefined;
  // eslint-disable-next-line no-console
  console.warn(
    `[genlayerClient] "${CHAIN_NAME}" isn't exported by the installed genlayer-js ` +
    `(run \`npm ls genlayer-js\` and check its actual genlayer-js/chains exports). ` +
    (fallbackName
      ? `Falling back to "${fallbackName}".`
      : `No known chain export was found at all — something is badly out of ` +
        `date. All reads/writes will fail until this is fixed.`) +
    ` Set VITE_GENLAYER_CHAIN to a chain that actually exists in your ` +
    `installed version, or pass VITE_GENLAYER_RPC_URL directly.`
  );
}

export function contractConfigured() {
  return Boolean(CONTRACT_ADDRESS);
}

export function contractAddress() {
  return CONTRACT_ADDRESS;
}

let client = null;
let currentAccount = null; // { type: 'wallet' | 'demo', address }

// Every GenLayer RPC call — even a read-only `gen_call` — appears to
// require a `from` address; the backend threw a bare Python `KeyError:
// 'from'` when the client had no account attached at all (see
// docs/genvm-gotchas.md #8). This throwaway account exists purely so
// anonymous reads (nobody's connected a wallet yet) always have *some*
// address to send as `from`. It never signs anything meaningful and is
// never shown as "connected" in the UI.
let readOnlyAccount = null;
function getReadOnlyAccount() {
  if (!readOnlyAccount) readOnlyAccount = createAccount();
  return readOnlyAccount;
}

function buildClient(account) {
  if (!chain) {
    throw new Error(
      "No usable genlayer-js chain export was found. Check the console warning above and your installed genlayer-js version."
    );
  }
  const opts = { chain, account: account || getReadOnlyAccount() };
  if (RPC_URL) opts.endpoint = RPC_URL;
  return createClient(opts);
}

/** Read-only client — works even with no wallet connected. */
function getReadClient() {
  if (!client) client = buildClient(undefined);
  return client;
}

/** Connect a real browser wallet (MetaMask or compatible EIP-1193 provider). */
export async function connectWallet() {
  if (typeof window === "undefined" || !window.ethereum) {
    throw new Error(
      "No browser wallet found. Install MetaMask, or use Try Demo Mode below to explore without one."
    );
  }
  const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
  const address = accounts[0];
  client = buildClient(address);
  currentAccount = { type: "wallet", address };
  return currentAccount;
}

/** Spin up a throwaway session key so anyone can try every write path instantly. */
export async function connectDemoAccount() {
  const account = createAccount();
  client = buildClient(account);
  currentAccount = { type: "demo", address: account.address };
  return currentAccount;
}

export function disconnect() {
  client = buildClient(undefined);
  currentAccount = null;
}

export function getCurrentAccount() {
  return currentAccount;
}

function requireClient() {
  if (!currentAccount) {
    throw new Error("Connect a wallet or start Demo Mode first.");
  }
  return client;
}

function requireAddress() {
  if (!CONTRACT_ADDRESS) {
    throw new Error(
      "VITE_SKYVERDICT_ADDRESS is not set — copy .env.example to .env.local and fill in the deployed contract address."
    );
  }
}

// ---------------------------------------------------------------------
// Writes
// ---------------------------------------------------------------------

export async function createPolicy({
  airlineCode, flightNumber, departureAirport,
  scheduledDepartureUtc, scheduledArrivalUtc,
  thresholdMinutes, payoutMultiplierBps, maxCoverage, premiumWei,
}) {
  requireAddress();
  const c = requireClient();
  return c.writeContract({
    address: CONTRACT_ADDRESS,
    method: "create_policy",
    args: [
      airlineCode, flightNumber, departureAirport,
      scheduledDepartureUtc, scheduledArrivalUtc,
      thresholdMinutes, payoutMultiplierBps, maxCoverage,
    ],
    value: premiumWei,
  });
}

export async function evaluateClaim(policyId, sourceUrls) {
  requireAddress();
  const c = requireClient();
  return c.writeContract({
    address: CONTRACT_ADDRESS,
    method: "evaluate_claim",
    args: [Number(policyId), sourceUrls],
  });
}

export async function appeal(policyId, extraSourceUrls) {
  requireAddress();
  const c = requireClient();
  return c.writeContract({
    address: CONTRACT_ADDRESS,
    method: "appeal",
    args: [Number(policyId), extraSourceUrls],
  });
}

export async function claimRefund(policyId) {
  requireAddress();
  const c = requireClient();
  return c.writeContract({
    address: CONTRACT_ADDRESS,
    method: "claim_refund",
    args: [Number(policyId)],
  });
}

// ---------------------------------------------------------------------
// Reads — no wallet required
// ---------------------------------------------------------------------

export async function getPolicy(policyId) {
  requireAddress();
  const c = getReadClient();
  return c.readContract({
    address: CONTRACT_ADDRESS,
    method: "get_policy",
    args: [Number(policyId)],
  });
}

export async function getClaimStatus(policyId) {
  requireAddress();
  const c = getReadClient();
  return c.readContract({
    address: CONTRACT_ADDRESS,
    method: "get_claim_status",
    args: [Number(policyId)],
  });
}

export async function getPool() {
  requireAddress();
  const c = getReadClient();
  return c.readContract({ address: CONTRACT_ADDRESS, method: "get_pool", args: [] });
}

export async function isDomainAllowed(domain) {
  requireAddress();
  const c = getReadClient();
  return c.readContract({
    address: CONTRACT_ADDRESS,
    method: "is_domain_allowed",
    args: [domain],
  });
}

/**
 * Optional — only present if the deployed contract includes the
 * get_total_policies view added alongside this frontend (see
 * docs/genvm-gotchas.md / TRD "Deployment targets"). Callers should treat
 * a thrown error here as "not available" and fall back to manual ID
 * lookup, not as a real failure.
 */
export async function getTotalPolicies() {
  requireAddress();
  const c = getReadClient();
  return c.readContract({
    address: CONTRACT_ADDRESS,
    method: "get_total_policies",
    args: [],
  });
}
