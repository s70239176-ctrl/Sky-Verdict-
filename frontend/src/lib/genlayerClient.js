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

// MetaMask (or any injected wallet) doesn't automatically know about or
// switch to GenLayer's network just because we called eth_requestAccounts —
// it stays on whatever chain it was already connected to (often Ethereum
// mainnet by default). Signing a GenLayer transaction while the wallet
// thinks it's on a different chain produced an "invalid parameters"
// rejection — matching how GenLayer's own reference app
// (genlayer-project-boilerplate) explicitly checks and switches network
// before allowing a wallet-signed transaction. Chain ID per GenLayer's
// network docs: Studionet = 61999, Testnet Bradbury = 4221.
const GENLAYER_CHAIN_IDS = { studionet: 61999, testnetAsimov: 4221, localnet: 61999 };
const GENLAYER_CHAIN_ID = GENLAYER_CHAIN_IDS[CHAIN_NAME] || 61999;
const GENLAYER_CHAIN_ID_HEX = `0x${GENLAYER_CHAIN_ID.toString(16)}`;
const GENLAYER_NETWORK_PARAMS = {
  chainId: GENLAYER_CHAIN_ID_HEX,
  chainName: "GenLayer Studio",
  nativeCurrency: { name: "GEN", symbol: "GEN", decimals: 18 },
  rpcUrls: [RPC_URL || "https://studio.genlayer.com/api"],
  blockExplorerUrls: [],
};

async function ensureWalletOnGenLayerNetwork() {
  const currentHex = await window.ethereum.request({ method: "eth_chainId" });
  if (parseInt(currentHex, 16) === GENLAYER_CHAIN_ID) return;

  try {
    await window.ethereum.request({
      method: "wallet_switchEthereumChain",
      params: [{ chainId: GENLAYER_CHAIN_ID_HEX }],
    });
  } catch (err) {
    // 4902 = the wallet doesn't have this network yet — add it, then switch
    if (err && err.code === 4902) {
      await window.ethereum.request({
        method: "wallet_addEthereumChain",
        params: [GENLAYER_NETWORK_PARAMS],
      });
    } else if (err && err.code === 4001) {
      throw new Error("You'll need to approve switching to the GenLayer network to continue.");
    } else {
      throw err;
    }
  }
}

export function contractAddress() {
  return CONTRACT_ADDRESS;
}

let client = null;
let currentAccount = null; // { type: 'wallet' | 'demo', address }

function buildClient(account) {
  if (!chain) {
    throw new Error(
      "No usable genlayer-js chain export was found. Check the console warning above and your installed genlayer-js version."
    );
  }
  // Deliberately omit `account` entirely when nobody's connected — matching
  // GenLayer's own reference app (genlayer-project-boilerplate), which never
  // manufactures a throwaway account for anonymous reads. An earlier version
  // of this file did fabricate one via createAccount() to work around a
  // `KeyError: 'from'` we hit — that turned out to be a symptom of an
  // unrelated wrong-chain bug (see docs/genvm-gotchas.md #8), and the
  // fabricated account was itself causing a *different* execution-time
  // failure server-side. Removed; do not reintroduce without solid evidence.
  const opts = { chain };
  if (account) opts.account = account;
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
  await ensureWalletOnGenLayerNetwork();
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
    functionName: "create_policy",
    args: [
      airlineCode, flightNumber, departureAirport,
      scheduledDepartureUtc, scheduledArrivalUtc,
      thresholdMinutes, payoutMultiplierBps, maxCoverage,
    ],
    value: premiumWei,
  });
}

// legs: array of { airlineCode, flightNumber, departureAirport,
// scheduledDepartureUtc, scheduledArrivalUtc, thresholdMinutes,
// payoutMultiplierBps, maxCoverage }. totalPremiumWei is split evenly
// across legs by the contract itself (see create_trip in SkyVerdict.py) —
// the frontend doesn't do any of that math, just sends the total value.
export async function createTrip(legs, totalPremiumWei) {
  requireAddress();
  const c = requireClient();
  return c.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "create_trip",
    args: [
      legs.map((l) => l.airlineCode),
      legs.map((l) => l.flightNumber),
      legs.map((l) => l.departureAirport),
      legs.map((l) => Number(l.scheduledDepartureUtc)),
      legs.map((l) => Number(l.scheduledArrivalUtc)),
      legs.map((l) => Number(l.thresholdMinutes)),
      legs.map((l) => Number(l.payoutMultiplierBps)),
      legs.map((l) => Number(l.maxCoverage)),
    ],
    value: totalPremiumWei,
  });
}

export async function evaluateClaim(policyId, sourceUrls) {
  requireAddress();
  const c = requireClient();
  return c.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "evaluate_claim",
    args: [Number(policyId), sourceUrls],
  });
}

export async function appeal(policyId, extraSourceUrls) {
  requireAddress();
  const c = requireClient();
  return c.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "appeal",
    args: [Number(policyId), extraSourceUrls],
  });
}

export async function claimRefund(policyId) {
  requireAddress();
  const c = requireClient();
  return c.writeContract({
    address: CONTRACT_ADDRESS,
    functionName: "claim_refund",
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
    functionName: "get_policy",
    args: [Number(policyId)],
  });
}

export async function getClaimStatus(policyId) {
  requireAddress();
  const c = getReadClient();
  return c.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "get_claim_status",
    args: [Number(policyId)],
  });
}

export async function getPool() {
  requireAddress();
  const c = getReadClient();
  return c.readContract({ address: CONTRACT_ADDRESS, functionName: "get_pool", args: [] });
}

export async function isDomainAllowed(domain) {
  requireAddress();
  const c = getReadClient();
  return c.readContract({
    address: CONTRACT_ADDRESS,
    functionName: "is_domain_allowed",
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
    functionName: "get_total_policies",
    args: [],
  });
}
