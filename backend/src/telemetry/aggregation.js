"use strict";

const MAX_AGE_MS = 2 * 60 * 1000;
const FUTURE_TOLERANCE_MS = 30 * 1000;
const MAX_ACCURACY_M = 100;
const MAX_DERIVED_SPEED_KMH = 160;

function finite(value) { return typeof value === "number" && Number.isFinite(value); }

function haversineKm(a, b) {
  const radians = (degrees) => degrees * Math.PI / 180;
  const dLat = radians(b.latitude - a.latitude);
  const dLon = radians(b.longitude - a.longitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function median(values) {
  const ordered = [...values].sort((a, b) => a - b);
  const middle = Math.floor(ordered.length / 2);
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2;
}

function usable(sample, now) {
  const point = sample.latest;
  if (!point || !finite(point.latitude) || !finite(point.longitude) || point.latitude < -90 || point.latitude > 90 || point.longitude < -180 || point.longitude > 180) return false;
  if (!finite(point.accuracy) || point.accuracy < 0 || point.accuracy > MAX_ACCURACY_M) return false;
  const time = new Date(point.timestamp).getTime();
  return Number.isFinite(time) && time <= now + FUTURE_TOLERANCE_MS && time >= now - MAX_AGE_MS;
}

function speedOf(sample) {
  const point = sample.latest;
  if (finite(point.speed) && point.speed >= 0 && point.speed <= MAX_DERIVED_SPEED_KMH) return point.speed;
  const previous = sample.previous;
  if (!previous) return null;
  const seconds = (new Date(point.timestamp).getTime() - new Date(previous.timestamp).getTime()) / 1000;
  if (seconds <= 0 || seconds > MAX_AGE_MS / 1000) return null;
  const speed = haversineKm(previous, point) / (seconds / 3600);
  return finite(speed) && speed <= MAX_DERIVED_SPEED_KMH ? speed : null;
}

function aggregateSamples(samples, { now = Date.now() } = {}) {
  const candidates = samples.filter((sample) => usable(sample, now));
  if (!candidates.length) return { status: "NO LIVE DATA", contributorCount: 0, confidence: "LOW", state: null, rejectedCount: samples.length };
  const center = {
    latitude: median(candidates.map((sample) => sample.latest.latitude)),
    longitude: median(candidates.map((sample) => sample.latest.longitude)),
  };
  const accepted = candidates.filter((sample) => haversineKm(center, sample.latest) <= Math.max(0.5, sample.latest.accuracy * 3 / 1000));
  if (!accepted.length) return { status: "NO LIVE DATA", contributorCount: 0, confidence: "LOW", state: null, rejectedCount: samples.length };

  let totalWeight = 0;
  let latitude = 0;
  let longitude = 0;
  let accuracy = 0;
  for (const sample of accepted) {
    const ageSeconds = Math.max(0, (now - new Date(sample.latest.timestamp).getTime()) / 1000);
    const weight = (1 / Math.max(5, sample.latest.accuracy) ** 2) * Math.exp(-ageSeconds / 90);
    totalWeight += weight;
    latitude += sample.latest.latitude * weight;
    longitude += sample.latest.longitude * weight;
    accuracy += sample.latest.accuracy * weight;
  }
  const speeds = accepted.map(speedOf).filter((speed) => speed !== null);
  const newest = accepted.reduce((latest, sample) => new Date(sample.latest.timestamp) > new Date(latest.latest.timestamp) ? sample : latest);
  const status = accepted.length >= 2 ? "LIVE" : "LIMITED DATA";
  return {
    status,
    contributorCount: accepted.length,
    confidence: accepted.length >= 4 ? "HIGH" : accepted.length >= 2 ? "MEDIUM" : "LOW",
    rejectedCount: samples.length - accepted.length,
    state: {
      latitude: latitude / totalWeight,
      longitude: longitude / totalWeight,
      speed: speeds.length ? median(speeds) : null,
      heading: finite(newest.latest.heading) ? newest.latest.heading : null,
      accuracy: accuracy / totalWeight,
      timestamp: new Date(newest.latest.timestamp),
      source: "LIVE CROWD TELEMETRY",
      contributorCount: accepted.length,
      confidence: accepted.length >= 4 ? "HIGH" : accepted.length >= 2 ? "MEDIUM" : "LOW",
    },
  };
}

function staleStatus(lastState, now = Date.now()) {
  if (!lastState?.timestamp) return "NO LIVE DATA";
  const age = now - new Date(lastState.timestamp).getTime();
  return age <= 10 * 60 * 1000 ? "STALE" : "NO LIVE DATA";
}

module.exports = { aggregateSamples, haversineKm, staleStatus, MAX_AGE_MS, MAX_ACCURACY_M };
