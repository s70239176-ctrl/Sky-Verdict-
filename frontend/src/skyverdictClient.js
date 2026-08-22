/**
 * Thin wrapper around genlayer-js pointing at the deployed SkyVerdict
 * contract. Fill in CONTRACT_ADDRESS after running deploy/deploy.py or
 * `genlayer deploy`. See https://docs.genlayer.com for the current
 * genlayer-js client API — this wrapper isolates that surface so the UI
 * components below don't need to change if the SDK's call shape does.
 */
import { createClient } from "genlayer-js";

const CONTRACT_ADDRESS = import.meta.env.VITE_SKYVERDICT_ADDRESS || "";
const RPC_URL = import.meta.env.VITE_GENLAYER_RPC_URL || "http://localhost:4000/api";

let client = null;
function getClient() {
  if (!client) {
    client = createClient({ rpcUrl: RPC_URL });
  }
  return client;
}

export async function createPolicy({
  airlineCode, flightNumber, departureAirport,
  scheduledDepartureUtc, scheduledArrivalUtc,
  thresholdMinutes, payoutMultiplierBps, maxCoverage, premiumWei,
}) {
  const c = getClient();
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
  const c = getClient();
  return c.writeContract({
    address: CONTRACT_ADDRESS,
    method: "evaluate_claim",
    args: [policyId, sourceUrls],
  });
}

export async function getPolicy(policyId) {
  const c = getClient();
  return c.readContract({
    address: CONTRACT_ADDRESS,
    method: "get_policy",
    args: [policyId],
  });
}

export async function getClaimStatus(policyId) {
  const c = getClient();
  return c.readContract({
    address: CONTRACT_ADDRESS,
    method: "get_claim_status",
    args: [policyId],
  });
}

export async function claimRefund(policyId) {
  const c = getClient();
  return c.writeContract({
    address: CONTRACT_ADDRESS,
    method: "claim_refund",
    args: [policyId],
  });
}
