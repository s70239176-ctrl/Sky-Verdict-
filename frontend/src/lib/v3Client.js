/**
 * v3 contract surface: challenge court, calibration, affiliates, deploy params.
 * Kept separate from genlayerClient.js (which owns wallet/client state) and
 * built on its exports, so the proven wallet + RPC plumbing is not touched.
 */
import { getWriteClient, getReadOnlyClient, contractAddress } from "./genlayerClient";

const read = (functionName, args = []) =>
  getReadOnlyClient().readContract({ address: contractAddress(), functionName, args });

const write = (functionName, args = [], value) =>
  getWriteClient().writeContract({
    address: contractAddress(),
    functionName,
    args,
    ...(value !== undefined ? { value } : {}),
  });

// ---- writes ----
export const finalizeClaim = (policyId) => write("finalize_claim", [Number(policyId)]);
export const challengeClaim = (policyId, extraSourceUrls, bondWei) =>
  write("challenge_claim", [Number(policyId), extraSourceUrls], BigInt(bondWei));
export const createPolicyReferred = (referrer, p) =>
  write(
    "create_policy_referred",
    [
      referrer, p.airlineCode, p.flightNumber, p.departureAirport,
      p.scheduledDepartureUtc, p.scheduledArrivalUtc,
      p.thresholdMinutes, p.payoutMultiplierBps, p.maxCoverage,
    ],
    p.premiumWei,
  );
export const affiliateWithdraw = (amount) => write("affiliate_withdraw", [Number(amount)]);

// ---- reads ----
export const getChallengeInfo = (policyId) => read("get_challenge_info", [Number(policyId)]);
export const getCalibration = (airline) => read("get_calibration", [airline]);
export const getLossStats = () => read("get_loss_stats");
export const getAffiliate = (address) => read("get_affiliate", [address]);
export const getFinalizeQueue = (limit = 10) => read("get_finalize_queue", [Number(limit)]);

// get_pool carries the immutable deploy parameters (challenge window,
// settlement buffer, sandbox flag). Cached: they never change, and hosted
// Studio rate-limits RPC.
let paramsCache = null;
export async function getDeployParams() {
  if (paramsCache) return paramsCache;
  try {
    const p = await read("get_pool");
    paramsCache = {
      challengeWindowSeconds: Number(p.challenge_window_seconds ?? 86400),
      settlementBufferSeconds: Number(p.settlement_buffer_seconds ?? 10800),
      sandboxMode: Boolean(p.sandbox_mode),
    };
  } catch {
    paramsCache = { challengeWindowSeconds: 86400, settlementBufferSeconds: 10800, sandboxMode: false };
  }
  return paramsCache;
}
