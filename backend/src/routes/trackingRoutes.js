"use strict";

const express = require("express");
const mongoose = require("mongoose");
const Bus = require("../models/Bus");
const TrackingSession = require("../models/TrackingSession");
const { requireDatabase } = require("../db");
const { authenticate, requireAdmin } = require("../middleware/auth");
const { aggregateSamples, staleStatus } = require("../telemetry/aggregation");

const router = express.Router();
const adminRouter = express.Router();
const isoDate = (value) => typeof value === "string" && /(?:Z|[+-]\d{2}:\d{2})$/i.test(value) && Number.isFinite(Date.parse(value));
const finiteOrNull = (value) => value === null || (typeof value === "number" && Number.isFinite(value));
const publicSession = (session) => ({ id: String(session._id), bus_id: session.busId, status: session.status, started_at: session.startedAt, ended_at: session.endedAt });

function createTrackingRouter({ readLive, persistObservation, persistAggregate = async () => {}, calculateState = async () => null, publish, invalidate = () => {} }) {
  router.use(requireDatabase, authenticate);

  router.post("/tracking-sessions", async (req, res) => {
    const busId = req.body?.bus_id;
    if (req.body?.consent !== true) return res.status(400).json({ error: "tracking_consent_required", message: "Confirm that you are travelling on this bus and want to share location before starting." });
    if (typeof busId !== "string" || !/^[A-Za-z0-9._-]{1,40}$/.test(busId)) return res.status(400).json({ error: "invalid_bus_id" });
    const bus = await Bus.findOne({ busId });
    let routeId = bus?.routeId || null;
    if (bus && bus.status !== "ACTIVE") return res.status(409).json({ error: "bus_not_active", message: "This bus is not currently accepting tracking contributions." });
    if (!bus) {
      const live = await readLive();
      const liveBus = live.buses.find((item) => item.bus_id === busId);
      if (!liveBus) return res.status(404).json({ error: "bus_not_found" });
      routeId = liveBus.route_id;
    }
    const existing = await TrackingSession.findOne({ user: req.user._id, status: "ACTIVE", startedAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } });
    if (existing) return res.status(409).json({ error: "tracking_session_exists", session: publicSession(existing) });
    await TrackingSession.updateMany({ user: req.user._id, status: "ACTIVE", startedAt: { $lt: new Date(Date.now() - 2 * 60 * 60 * 1000) } }, { $set: { status: "STOPPED", endedAt: new Date(), latest: null, previous: null } });
    try {
      const session = await TrackingSession.create({ user: req.user._id, bus: bus?._id, busId, routeId, status: "ACTIVE", consentAt: new Date() });
      return res.status(201).json({ session: publicSession(session), message: "Session started. Location is sent only while this session remains active." });
    } catch (error) {
      if (error.code === 11000) return res.status(409).json({ error: "tracking_session_exists" });
      throw error;
    }
  });

  router.get("/tracking-sessions/current", async (req, res) => {
    const expiredBefore = new Date(Date.now() - 2 * 60 * 60 * 1000);
    await TrackingSession.updateMany({ user: req.user._id, status: "ACTIVE", startedAt: { $lt: expiredBefore } }, { $set: { status: "STOPPED", endedAt: new Date(), latest: null, previous: null } });
    const session = await TrackingSession.findOne({ user: req.user._id, status: "ACTIVE" }).sort({ startedAt: -1 });
    return res.json({ session: session ? publicSession(session) : null });
  });

  router.post("/tracking-sessions/:sessionId/stop", async (req, res) => {
    if (!mongoose.isValidObjectId(req.params.sessionId)) return res.status(400).json({ error: "invalid_session_id" });
    const session = await TrackingSession.findOne({ _id: req.params.sessionId, user: req.user._id, status: "ACTIVE" });
    if (!session) return res.status(404).json({ error: "active_session_not_found" });
    session.status = "STOPPED";
    session.endedAt = new Date();
    session.latest = undefined;
    session.previous = undefined;
    await session.save();
    const remainingSessions = await TrackingSession.find({ busId: session.busId, status: "ACTIVE" }).select("+latest +previous").lean();
    const aggregate = aggregateSamples(remainingSessions);
    const activeContributors = aggregate.contributorCount;
    const routeId = session.routeId || (session.bus ? (await Bus.findById(session.bus).select("routeId").lean())?.routeId
      : (await readLive()).buses.find((item) => item.bus_id === session.busId)?.route_id);
    try {
      await persistAggregate(session.busId, routeId, aggregate);
    } catch (error) {
      console.error("[BUSBEST API] Aggregate refresh after stop failed:", error.code || error.name || "unknown error");
    }
    invalidate();
    const bus = await Bus.findOne({ busId: session.busId });
    if (bus) {
      bus.trackingStatus = aggregate.status === "LIVE" ? "LIVE" : aggregate.status === "LIMITED DATA" ? "LIMITED_DATA" : staleStatus(bus.lastState).replaceAll(" ", "_");
      if (aggregate.state) bus.lastState = aggregate.state;
      if (bus.lastState) bus.lastState.contributorCount = activeContributors;
      await bus.save();
    }
    const liveStatus = aggregate.status === "NO LIVE DATA" ? staleStatus(bus?.lastState) : aggregate.status;
    let enriched = null;
    if (aggregate.state) {
      try { enriched = await calculateState(session.busId, routeId, aggregate.state, aggregate); }
      catch (error) { console.error("[BUSBEST API] ETA refresh after stop failed:", error.code || error.name || "unknown error"); }
    }
    publish({ type: "bus_state", bus: enriched ? { ...enriched, bus_id: session.busId, route_id: routeId, contributor_count: activeContributors, tracking_status: aggregate.status } : { bus_id: session.busId, contributor_count: activeContributors, tracking_status: liveStatus } });
    return res.json({ session: publicSession(session), message: "Sharing stopped. This session no longer retains precise coordinates. Previously accepted samples remain in de-identified HDFS history for bus analysis.", tracking_status: liveStatus, contributor_count: activeContributors });
  });

  router.post("/telemetry", async (req, res) => {
    const { tracking_session_id: sessionId, latitude, longitude, speed = null, heading = null, accuracy, timestamp } = req.body || {};
    if (!mongoose.isValidObjectId(sessionId) || !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
        !Number.isFinite(longitude) || longitude < -180 || longitude > 180 || !finiteOrNull(speed) || (speed !== null && (speed < 0 || speed > 160)) ||
        !finiteOrNull(heading) || (heading !== null && (heading < 0 || heading > 360)) || typeof accuracy !== "number" || !Number.isFinite(accuracy) || accuracy < 0 || accuracy > 100 || !isoDate(timestamp)) {
      return res.status(400).json({ error: "invalid_telemetry", message: "Check coordinates, speed, heading, GPS accuracy (0–100 m), and timezone-aware timestamp." });
    }
    const observedAt = new Date(timestamp);
    const now = Date.now();
    if (observedAt.getTime() > now + 30_000 || observedAt.getTime() < now - 120_000) return res.status(400).json({ error: "timestamp_out_of_range" });
    const session = await TrackingSession.findOne({ _id: sessionId, user: req.user._id, status: "ACTIVE" }).select("+latest +previous");
    if (!session) return res.status(403).json({ error: "active_tracking_session_required" });
    if (session.startedAt.getTime() < now - 2 * 60 * 60 * 1000) return res.status(409).json({ error: "tracking_session_expired", message: "This tracking session expired. Stop it and start a new one to continue." });
    if (session.latest && observedAt.getTime() - new Date(session.latest.timestamp).getTime() < 2_000) return res.status(429).json({ error: "telemetry_rate_limited" });
    const bus = await Bus.findOne({ busId: session.busId });
    if (bus && bus.status !== "ACTIVE") return res.status(409).json({ error: "bus_not_active" });
    const routeId = bus?.routeId || session.routeId || (await readLive()).buses.find((item) => item.bus_id === session.busId)?.route_id;
    if (!routeId) return res.status(404).json({ error: "bus_not_found" });

    const incoming = { latitude, longitude, speed, heading, accuracy, timestamp: observedAt };
    const samples = await TrackingSession.find({ busId: session.busId, status: "ACTIVE" }).select("+latest +previous").lean();
    const withIncoming = samples.filter((item) => String(item._id) !== String(session._id)).concat([{ latest: incoming, previous: session.latest }]);
    const aggregate = aggregateSamples(withIncoming, { now });
    if (!aggregate.state) return res.status(422).json({ error: "telemetry_outlier", message: "This location did not pass the recent GPS quality checks." });

    session.previous = session.latest || undefined;
    session.latest = incoming;
    await session.save();
    try {
      const result = await persistObservation({ bus_id: session.busId, route_id: routeId, ...incoming, consent: true }, aggregate);
      invalidate();
      const updatedBus = bus || await Bus.findOne({ busId: session.busId });
      if (updatedBus) {
        updatedBus.trackingStatus = aggregate.status === "LIVE" ? "LIVE" : "LIMITED_DATA";
        updatedBus.lastState = aggregate.state;
        await updatedBus.save();
      }
      const publicState = {
        bus_id: session.busId, route_id: routeId,
        latitude: aggregate.state.latitude, longitude: aggregate.state.longitude,
        speed: aggregate.state.speed, heading: aggregate.state.heading, accuracy: aggregate.state.accuracy,
        timestamp: aggregate.state.timestamp, data_label: "LIVE CROWD TELEMETRY",
        tracking_status: aggregate.status, contributor_count: aggregate.contributorCount,
        confidence: aggregate.confidence,
      };
      let enriched = publicState;
      try { enriched = await calculateState(session.busId, routeId, aggregate.state, aggregate) || publicState; } catch { /* Keep the validated aggregate available if the Python ETA calculation is briefly unavailable. */ }
      publish({ type: "bus_state", bus: enriched });
      return res.status(201).json({ ...result, tracking_status: aggregate.status, contributor_count: aggregate.contributorCount, confidence: aggregate.confidence });
    } catch (error) {
      console.error("[BUSBEST API] Telemetry persistence failed:", error.code || error.name || "unknown error");
      return res.status(503).json({ error: "telemetry_persistence_unavailable", message: "Could not store telemetry in local HDFS/HBase. The active session can retry." });
    }
  });

  adminRouter.use(requireDatabase, authenticate, requireAdmin);
  adminRouter.get("/tracking", async (req, res) => {
    const [sessions, buses, recent] = await Promise.all([
      TrackingSession.aggregate([{ $match: { status: "ACTIVE", startedAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) } } }, { $group: { _id: "$busId", contributor_count: { $sum: 1 }, oldest_started_at: { $min: "$startedAt" } } }]),
      Bus.find().select("busId routeId status trackingStatus lastState").lean(),
      TrackingSession.aggregate([{ $match: { status: "ACTIVE", startedAt: { $gte: new Date(Date.now() - 2 * 60 * 60 * 1000) }, "latest.timestamp": { $gte: new Date(Date.now() - 120_000) } } }, { $group: { _id: "$busId", count: { $sum: 1 } } }]),
    ]);
    const byBus = new Map(sessions.map((item) => [item._id, item]));
    const recentByBus = new Map(recent.map((item) => [item._id, item.count]));
    const live = await readLive();
    const byLiveId = new Map(live.buses.map((item) => [item.bus_id, item]));
    const stateRows = live.buses.map((state) => ({
      bus_id: state.bus_id, route_id: state.route_id,
      bus_status: buses.find((bus) => bus.busId === state.bus_id)?.status || "PIPELINE DATA",
      tracking_status: state.tracking_status,
      contributor_count: recentByBus.get(state.bus_id) || 0,
      last_update: state.timestamp || null, accuracy_m: state.gps_accuracy_m ?? null,
      speed_kmh: state.speed ?? null, data_source: state.data_label || "UNKNOWN",
      confidence: state.confidence || null,
    }));
    for (const bus of buses) if (!byLiveId.has(bus.busId)) stateRows.push({ bus_id: bus.busId, route_id: bus.routeId, bus_status: bus.status, tracking_status: bus.trackingStatus, contributor_count: recentByBus.get(bus.busId) || 0, last_update: bus.lastState?.timestamp || null, accuracy_m: bus.lastState?.accuracy ?? null, speed_kmh: bus.lastState?.speed ?? null, data_source: bus.lastState?.source || "NO LIVE DATA", confidence: bus.lastState?.confidence || null });
    res.json({ buses: stateRows, active_sessions: sessions.reduce((sum, item) => sum + item.contributor_count, 0) });
  });

  return { router, adminRouter };
}

module.exports = { createTrackingRouter };
