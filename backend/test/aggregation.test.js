"use strict";

const { test } = require("node:test");
const assert = require("node:assert/strict");
const { aggregateSamples, haversineKm, staleStatus } = require("../src/telemetry/aggregation");

function point(latitude, longitude, secondsAgo = 0, accuracy = 12, speed = 25) {
  return { latest: { latitude, longitude, accuracy, speed, timestamp: new Date(Date.now() - secondsAgo * 1000) }, previous: null };
}

test("aggregate uses recent accurate points and weighted representative location", () => {
  const result = aggregateSamples([point(9.59, 76.52, 0, 8), point(9.5901, 76.5201, 5, 20)], { now: Date.now() });
  assert.equal(result.status, "LIVE");
  assert.equal(result.contributorCount, 2);
  assert.equal(result.confidence, "MEDIUM");
  assert.ok(result.state.latitude > 9.59 && result.state.latitude < 9.5901);
  assert.equal(result.state.source, "LIVE CROWD TELEMETRY");
});

test("rejects stale, low-accuracy, and distant GPS outliers", () => {
  const recent = [point(9.59, 76.52), point(9.5901, 76.5201)];
  const result = aggregateSamples([...recent, point(9.60, 76.53), point(9.59, 76.52, 200), point(9.59, 76.52, 0, 250)]);
  assert.equal(result.contributorCount, 2);
  assert.equal(result.rejectedCount, 3);
});

test("one accepted contributor is limited and no accepted data yields no live data", () => {
  assert.equal(aggregateSamples([point(9.59, 76.52)]).status, "LIMITED DATA");
  assert.equal(aggregateSamples([point(9.59, 76.52, 180)]).status, "NO LIVE DATA");
  assert.equal(staleStatus({ timestamp: new Date(Date.now() - 11 * 60_000) }), "NO LIVE DATA");
});

test("haversine distance is finite and positive", () => {
  const km = haversineKm({ latitude: 9.59, longitude: 76.52 }, { latitude: 9.60, longitude: 76.52 });
  assert.ok(km > 1 && km < 2);
});
