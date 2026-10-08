import test from "node:test";
import assert from "node:assert/strict";
import { sourceUrlsFor, bareNumber, shouldSettle } from "./sources.js";

test("bareNumber strips a leading airline code only", () => {
  assert.equal(bareNumber("DL", "DL202"), "202");
  assert.equal(bareNumber("DL", "202"), "202");
  assert.equal(bareNumber("AA", "aa 100"), "100");
});

test("sourceUrlsFor builds two https URLs on distinct providers", () => {
  const urls = sourceUrlsFor({ airline_code: "AA", flight_number: "100" });
  assert.deepEqual(urls, [
    "https://www.flightaware.com/live/flight/AAL100",
    "https://www.flightstats.com/v2/flight-tracker/AA/100",
  ]);
  const hosts = urls.map((u) => new URL(u).hostname.replace(/^www\./, ""));
  assert.equal(new Set(hosts).size, 2);
  assert.ok(urls.every((u) => u.startsWith("https://")));
});

test("unknown airline falls back to the IATA code", () => {
  const [fa] = sourceUrlsFor({ airline_code: "ZZ", flight_number: "ZZ9" });
  assert.equal(fa, "https://www.flightaware.com/live/flight/ZZ9");
});

test("shouldSettle respects status, buffer and already-handled ids", () => {
  const p = { policy_id: 7, status: "ACTIVE", scheduled_arrival_utc: 1000 };
  assert.equal(shouldSettle(p, 1000 + 3 * 3600 - 1, new Set()), false);
  assert.equal(shouldSettle(p, 1000 + 3 * 3600, new Set()), true);
  assert.equal(shouldSettle(p, 1000 + 3 * 3600, new Set([7])), false);
  assert.equal(shouldSettle({ ...p, status: "INDETERMINATE" }, 99999, new Set()), false);
});
