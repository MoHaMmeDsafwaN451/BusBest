"use strict";

const { promisify } = require("node:util");
const { execFile } = require("node:child_process");
const http = require("node:http");
const express = require("express");
const mongoose = require("mongoose");
const { WebSocketServer, WebSocket } = require("ws");
const { connectDatabase, requireDatabase } = require("./db");
const { authRouter } = require("./routes/authRoutes");
const { busManagementRouter, adminRouter, myRouter, registryRouter } = require("./routes/applicationRoutes");
const { authenticate, requireAdmin } = require("./middleware/auth");
const Bus = require("./models/Bus");
const Route = require("./models/Route");
const TrackingSession = require("./models/TrackingSession");
const { reportsRouter, adminReportsRouter } = require("./routes/reportRoutes");
const { createTrackingRouter } = require("./routes/trackingRoutes");

const execFileAsync = promisify(execFile);
const app = express();

const PORT = Number(process.env.PORT || 3001);
const HOST = process.env.HOST || "127.0.0.1";
const WSL_DISTRO = process.env.WSL_DISTRO || "Ubuntu";
const WSL_PROJECT_DIR = process.env.WSL_PROJECT_DIR || "/mnt/c/Users/ZABEER KARATT/BUSBEST";
const WSL_JAVA_HOME = process.env.WSL_JAVA_HOME || "/usr/lib/jvm/java-17-openjdk-amd64";
const WSL_HADOOP_HOME = process.env.WSL_HADOOP_HOME || "/home/zabeer_karatt/opt/hadoop-3.5.0";
const WSL_HBASE_HOME = process.env.WSL_HBASE_HOME || "/home/zabeer_karatt/opt/hbase-2.6.7";
const WSL_PYTHON = process.env.WSL_PYTHON || "python3";
const DATA_CACHE_MS = Number(process.env.DATA_CACHE_MS || 30000);
const LIVE_CACHE_MS = Number(process.env.LIVE_CACHE_MS || 15000);
const PIPELINE_TIMEOUT_MS = Number(process.env.PIPELINE_TIMEOUT_MS || 60000);
const corsOrigins = (process.env.CORS_ORIGIN || "http://localhost:5173")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  throw new Error("PORT must be an integer between 1 and 65535");
}

// Keep CORS limited to the configured frontend origin(s); no credentials or secrets.
app.use((req, res, next) => {
  const origin = req.get("origin");
  if (origin && (corsOrigins.includes("*") || corsOrigins.includes(origin))) {
    res.setHeader("Access-Control-Allow-Origin", corsOrigins.includes("*") ? "*" : origin);
    res.setHeader("Vary", "Origin");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type,Authorization");
  if (req.method === "OPTIONS") return res.sendStatus(204);
  next();
});

app.use(express.json({ limit: "32kb" }));

let cachedReport = null;
let cacheExpiresAt = 0;
let inFlightReport = null;
let cachedLiveReport = null;
let liveCacheExpiresAt = 0;
let inFlightLiveReport = null;
const startedAt = new Date().toISOString();
let websocketServiceReady = false;

function shellQuote(value) {
  return `'${String(value).replaceAll("'", "'\\''")}'`;
}

async function loadPipelineReport() {
  const hadoopBin = `${WSL_HADOOP_HOME}/bin`;
  const hadoopSbin = `${WSL_HADOOP_HOME}/sbin`;
  const hbaseBin = `${WSL_HBASE_HOME}/bin`;
  const command = [
    `export JAVA_HOME=${shellQuote(WSL_JAVA_HOME)}`,
    `export HADOOP_HOME=${shellQuote(WSL_HADOOP_HOME)}`,
    'export HADOOP_CONF_DIR="$HADOOP_HOME/etc/hadoop"',
    `export HBASE_HOME=${shellQuote(WSL_HBASE_HOME)}`,
    'export HBASE_CONF_DIR="$HBASE_HOME/conf"',
    `export PATH=${shellQuote(`${hbaseBin}:${hadoopBin}:${hadoopSbin}`)}:"$PATH"`,
    `cd -- ${shellQuote(WSL_PROJECT_DIR)}`,
    `PYTHONDONTWRITEBYTECODE=1 ${shellQuote(WSL_PYTHON)} scripts/run_traffic_eta.py`,
  ].join(" && ");

  const { stdout, stderr } = await execFileAsync(
    "wsl.exe",
    ["-d", WSL_DISTRO, "--exec", "bash", "-c", command],
    { windowsHide: true, timeout: PIPELINE_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 },
  );
  if (stderr.trim()) console.warn(`[BUSBEST pipeline] ${stderr.trim()}`);
  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Python traffic/ETA runner did not return valid JSON: ${error.message}`);
  }
}

async function getPipelineReport() {
  if (cachedReport && Date.now() < cacheExpiresAt) return cachedReport;
  if (!inFlightReport) {
    inFlightReport = loadPipelineReport()
      .then((report) => {
        cachedReport = report;
        cacheExpiresAt = Date.now() + DATA_CACHE_MS;
        return report;
      })
      .finally(() => {
        inFlightReport = null;
      });
  }
  return inFlightReport;
}

function clearPipelineCache() {
  cachedReport = null;
  cacheExpiresAt = 0;
}

async function ingestTelemetry(observation, aggregate) {
  const encoded = Buffer.from(JSON.stringify({ observation, aggregate }), "utf8").toString("base64url");
  const hadoopBin = `${WSL_HADOOP_HOME}/bin`;
  const hadoopSbin = `${WSL_HADOOP_HOME}/sbin`;
  const hbaseBin = `${WSL_HBASE_HOME}/bin`;
  const command = [
    `export JAVA_HOME=${shellQuote(WSL_JAVA_HOME)}`,
    `export HADOOP_HOME=${shellQuote(WSL_HADOOP_HOME)}`,
    'export HADOOP_CONF_DIR="$HADOOP_HOME/etc/hadoop"',
    `export HBASE_HOME=${shellQuote(WSL_HBASE_HOME)}`,
    'export HBASE_CONF_DIR="$HBASE_HOME/conf"',
    `export PATH=${shellQuote(`${hbaseBin}:${hadoopBin}:${hadoopSbin}`)}:"$PATH"`,
    `cd -- ${shellQuote(WSL_PROJECT_DIR)}`,
    `${shellQuote(WSL_PYTHON)} scripts/ingest_telemetry.py --payload-base64 ${encoded}`,
  ].join(" && ");
  const { stdout } = await execFileAsync("wsl.exe", ["-d", WSL_DISTRO, "--exec", "bash", "-c", command], {
    windowsHide: true, timeout: PIPELINE_TIMEOUT_MS, maxBuffer: 256 * 1024,
  });
  return JSON.parse(stdout);
}

async function persistAggregate(busId, routeId, aggregate) {
  const encoded = Buffer.from(JSON.stringify({ bus_id: busId, route_id: routeId, aggregate }), "utf8").toString("base64url");
  const command = [
    `export JAVA_HOME=${shellQuote(WSL_JAVA_HOME)}`,
    `export HADOOP_HOME=${shellQuote(WSL_HADOOP_HOME)}`,
    'export HADOOP_CONF_DIR="$HADOOP_HOME/etc/hadoop"',
    `export HBASE_HOME=${shellQuote(WSL_HBASE_HOME)}`,
    'export HBASE_CONF_DIR="$HBASE_HOME/conf"',
    `export PATH=${shellQuote(`${WSL_HBASE_HOME}/bin:${WSL_HADOOP_HOME}/bin:${WSL_HADOOP_HOME}/sbin`)}:"$PATH"`,
    `cd -- ${shellQuote(WSL_PROJECT_DIR)}`,
    `${shellQuote(WSL_PYTHON)} scripts/ingest_telemetry.py --aggregate-only-base64 ${encoded}`,
  ].join(" && ");
  const { stdout } = await execFileAsync("wsl.exe", ["-d", WSL_DISTRO, "--exec", "bash", "-c", command], { windowsHide: true, timeout: PIPELINE_TIMEOUT_MS, maxBuffer: 256 * 1024 });
  return JSON.parse(stdout);
}

async function calculateLiveState(busId, routeId, aggregateState, aggregate) {
  const route = mongoose.connection.readyState === 1 ? await Route.findOne({ routeId }).select("routeId name start destination stops status").lean() : null;
  const historicalRows = cachedReport?.historical_average_speed_by_bus || [];
  const historicalAverageByBus = Object.fromEntries(historicalRows.map((row) => [row.bus_id, row.average_speed_kmh]));
  const state = {
    ...aggregateState,
    bus_id: busId,
    route_id: routeId,
    data_source: "LIVE CROWD TELEMETRY",
    tracking_status: aggregate.status,
    contributor_count: aggregate.contributorCount,
  };
  const encoded = Buffer.from(JSON.stringify({ state, route, historicalAverageByBus }), "utf8").toString("base64url");
  const command = [
    `export JAVA_HOME=${shellQuote(WSL_JAVA_HOME)}`,
    `export HADOOP_HOME=${shellQuote(WSL_HADOOP_HOME)}`,
    'export HADOOP_CONF_DIR="$HADOOP_HOME/etc/hadoop"',
    `export HBASE_HOME=${shellQuote(WSL_HBASE_HOME)}`,
    'export HBASE_CONF_DIR="$HBASE_HOME/conf"',
    `export PATH=${shellQuote(`${WSL_HBASE_HOME}/bin:${WSL_HADOOP_HOME}/bin:${WSL_HADOOP_HOME}/sbin`)}:"$PATH"`,
    `cd -- ${shellQuote(WSL_PROJECT_DIR)}`,
    `PYTHONDONTWRITEBYTECODE=1 ${shellQuote(WSL_PYTHON)} scripts/calculate_live_bus.py ${encoded}`,
  ].join(" && ");
  const { stdout } = await execFileAsync("wsl.exe", ["-d", WSL_DISTRO, "--exec", "bash", "-c", command], { windowsHide: true, timeout: PIPELINE_TIMEOUT_MS, maxBuffer: 256 * 1024 });
  return JSON.parse(stdout);
}

async function loadLiveReport() {
  const routes = mongoose.connection.readyState === 1 ? await Route.find({ status: "ACTIVE" }).select("routeId name start destination stops status").lean() : [];
  const liveConfig = { routes, historicalAverageByBus: cachedReport?.historical_average_speed_by_bus || [] };
  const encodedRoutes = Buffer.from(JSON.stringify(liveConfig), "utf8").toString("base64url");
  const hadoopBin = `${WSL_HADOOP_HOME}/bin`;
  const hadoopSbin = `${WSL_HADOOP_HOME}/sbin`;
  const hbaseBin = `${WSL_HBASE_HOME}/bin`;
  const command = [
    `export JAVA_HOME=${shellQuote(WSL_JAVA_HOME)}`,
    `export HADOOP_HOME=${shellQuote(WSL_HADOOP_HOME)}`,
    'export HADOOP_CONF_DIR="$HADOOP_HOME/etc/hadoop"',
    `export HBASE_HOME=${shellQuote(WSL_HBASE_HOME)}`,
    'export HBASE_CONF_DIR="$HBASE_HOME/conf"',
    `export PATH=${shellQuote(`${hbaseBin}:${hadoopBin}:${hadoopSbin}`)}:"$PATH"`,
    `cd -- ${shellQuote(WSL_PROJECT_DIR)}`,
    `PYTHONDONTWRITEBYTECODE=1 ${shellQuote(WSL_PYTHON)} scripts/run_live_state.py ${encodedRoutes}`,
  ].join(" && ");
  const { stdout } = await execFileAsync("wsl.exe", ["-d", WSL_DISTRO, "--exec", "bash", "-c", command], { windowsHide: true, timeout: PIPELINE_TIMEOUT_MS, maxBuffer: 2 * 1024 * 1024 });
  const report = JSON.parse(stdout);
  const appBuses = mongoose.connection.readyState === 1 ? await Bus.find({ status: "ACTIVE" }).select("busId name routeId registrationNumber trackingStatus lastState").lean() : [];
  const recentContributors = mongoose.connection.readyState === 1 ? await TrackingSession.aggregate([
    { $match: { status: "ACTIVE", "latest.timestamp": { $gte: new Date(Date.now() - 120_000) } } },
    { $group: { _id: "$busId", count: { $sum: 1 } } },
  ]) : [];
  const contributorCounts = new Map(recentContributors.map((item) => [item._id, item.count]));
  const appById = new Map(appBuses.map((bus) => [bus.busId, bus]));
  const liveIds = new Set();
  const now = Date.now();
  const buses = report.buses.map((bus) => {
    liveIds.add(bus.bus_id);
    const appBus = appById.get(bus.bus_id);
    const age = now - new Date(bus.timestamp).getTime();
    const contributorCount = contributorCounts.get(bus.bus_id) || 0;
    const trackingStatus = bus.data_label === "SIMULATED DEMO GPS DATA" ? "DEMO"
      : age <= 120_000 && contributorCount > 0 ? (contributorCount >= 2 ? "LIVE" : "LIMITED_DATA")
        : age <= 10 * 60_000 ? "STALE" : "NO_LIVE_DATA";
    return { ...bus, name: appBus?.name || "", tracking_status: trackingStatus, contributor_count: bus.data_label === "SIMULATED DEMO GPS DATA" ? 0 : contributorCount, last_update_age_seconds: Math.max(0, Math.floor(age / 1000)) };
  });
  for (const bus of appBuses) {
    if (liveIds.has(bus.busId)) continue;
    buses.push({ bus_id: bus.busId, route_id: bus.routeId, name: bus.name, latitude: null, longitude: null, speed: null, timestamp: bus.lastState?.timestamp || null, tracking_status: bus.lastState?.source === "LIVE CROWD TELEMETRY" ? "NO_LIVE_DATA" : bus.trackingStatus || "NO_LIVE_DATA", data_label: bus.lastState?.source || "NO LIVE DATA", traffic_level: "UNKNOWN", eta_minutes: null, eta_status: "distance_unavailable", next_stop: null, contributor_count: 0, confidence: null, last_update_age_seconds: null });
  }
  const routeMap = new Map();
  for (const bus of buses) if (!routeMap.has(bus.route_id)) routeMap.set(bus.route_id, { route_id: bus.route_id, name: bus.route_id, start: "", destination: "", stops: [], status: "ACTIVE" });
  for (const route of routes) routeMap.set(route.routeId, { route_id: route.routeId, name: route.name, start: route.start, destination: route.destination, stops: [...(route.stops || [])].sort((a, b) => a.sequence - b.sequence), status: route.status });
  for (const bus of buses) {
    const route = routeMap.get(bus.route_id);
    bus.route_label = route?.start && route?.destination ? `${route.start} → ${route.destination}` : route?.name || bus.route_id;
  }
  return { count: buses.length, buses, routes: [...routeMap.values()].sort((a, b) => a.route_id.localeCompare(b.route_id)), refreshed_at: new Date().toISOString() };
}

async function getLiveBusReport() {
  if (cachedLiveReport && Date.now() < liveCacheExpiresAt) return cachedLiveReport;
  if (!inFlightLiveReport) {
    inFlightLiveReport = loadLiveReport().then((report) => {
      cachedLiveReport = report;
      liveCacheExpiresAt = Date.now() + LIVE_CACHE_MS;
      return report;
    }).finally(() => { inFlightLiveReport = null; });
  }
  return inFlightLiveReport;
}

function clearLiveCache() { cachedLiveReport = null; liveCacheExpiresAt = 0; }

const websocketClients = new Set();
function publish(event) {
  const encoded = JSON.stringify(event);
  for (const socket of websocketClients) if (socket.readyState === WebSocket.OPEN) socket.send(encoded);
}

function attachWebSocket(server) {
  const wss = new WebSocketServer({
    server,
    path: "/ws",
    maxPayload: 16 * 1024,
    verifyClient: (info, done) => {
      const origin = info.origin;
      if (!origin || corsOrigins.includes("*") || corsOrigins.includes(origin)) return done(true);
      return done(false, 403, "origin not allowed");
    },
  });
  wss.on("connection", (socket) => {
    websocketClients.add(socket);
    getLiveBusReport().then((report) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "snapshot", ...report })); }).catch(() => {});
    socket.on("close", () => websocketClients.delete(socket));
    socket.on("error", () => websocketClients.delete(socket));
  });
  websocketServiceReady = true;
  server.on("close", () => wss.close());
  return wss;
}

const tracking = createTrackingRouter({
  readLive: getLiveBusReport,
  persistObservation: ingestTelemetry,
  persistAggregate,
  calculateState: calculateLiveState,
  publish,
  invalidate: () => { clearPipelineCache(); clearLiveCache(); },
});

function apiBus(report, bus) {
  return {
    bus_id: bus.bus_id,
    route_id: bus.route_id,
    latitude: bus.latitude,
    longitude: bus.longitude,
    speed: bus.speed,
    timestamp: bus.timestamp,
    traffic_level: bus.traffic_level,
    estimated_speed_kmh: bus.estimated_speed_kmh,
    demo_distance_km: bus.remaining_distance_km,
    eta_minutes: bus.eta_minutes,
    eta_status: bus.eta_status,
    data_label: bus.data_label || report.data_label,
    eta_distance_note: bus.distance_basis,
  };
}

function sendPipelineError(res, error) {
  console.error("[BUSBEST API] Pipeline request failed:", error);
  return res.status(503).json({
    error: "bus_data_unavailable",
    message: "BUSBEST could not read the current HBase/HDFS pipeline. Check WSL, HDFS, and HBase, then retry.",
  });
}

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", service: "busbest-api", started_at: startedAt });
});

app.get("/api/live/buses", async (req, res) => {
  try {
    const report = await getLiveBusReport();
    res.setHeader("Cache-Control", "public, max-age=2, stale-while-revalidate=5");
    return res.json(report);
  } catch (error) {
    return sendPipelineError(res, error);
  }
});

app.get("/api/buses", async (req, res) => {
  try {
    const report = await getPipelineReport();
    const buses = report.buses.map((bus) => apiBus(report, bus));
    res.json({ data_label: report.data_label, count: buses.length, buses });
  } catch (error) {
    sendPipelineError(res, error);
  }
});

app.get("/api/buses/:busId", async (req, res) => {
  try {
    const report = await getPipelineReport();
    const bus = report.buses.find((item) => item.bus_id === req.params.busId);
    if (!bus) return res.status(404).json({ error: "bus_not_found", bus_id: req.params.busId });
    res.json(apiBus(report, bus));
  } catch (error) {
    sendPipelineError(res, error);
  }
});

app.get("/api/routes", async (req, res) => {
  try {
    const report = await getPipelineReport();
    const routes = new Map();
    for (const bus of report.buses) {
      if (!routes.has(bus.route_id)) routes.set(bus.route_id, []);
      routes.get(bus.route_id).push(bus.bus_id);
    }
    res.json({
      data_label: report.data_label,
      count: routes.size,
      routes: [...routes.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([route_id, bus_ids]) => ({
        route_id,
        bus_count: bus_ids.length,
        bus_ids: bus_ids.sort(),
      })),
    });
  } catch (error) {
    sendPipelineError(res, error);
  }
});

app.get("/api/analytics/summary", async (req, res) => {
  try {
    const report = await getPipelineReport();
    const trafficCounts = {};
    const routeIds = new Set();
    for (const bus of report.buses) {
      routeIds.add(bus.route_id);
      trafficCounts[bus.traffic_level] = (trafficCounts[bus.traffic_level] || 0) + 1;
    }
    res.json({
      data_label: report.data_label,
      current_bus_count: report.buses.length,
      current_route_count: routeIds.size,
      current_traffic_distribution: trafficCounts,
      historical_average_speed_by_bus: report.historical_average_speed_by_bus,
      historical_average_source: report.historical_speed_source,
      historical_edge_cases: report.edge_case_checks,
      note: "Historical averages are existing MapReduce output, previously verified against Hive. Current traffic counts come from the Python engine's HBase-backed states.",
    });
  } catch (error) {
    sendPipelineError(res, error);
  }
});

// These routes use MongoDB only for user-managed application records.
app.use("/api/auth", authRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/my", myRouter);
app.use("/api/registry", registryRouter);
app.use("/api/buses", busManagementRouter);
app.use("/api/admin", adminRouter);
app.use("/api/admin/reports", adminReportsRouter);
app.use("/api", tracking.router);
app.use("/api/admin", tracking.adminRouter);

app.get("/api/admin/system", requireDatabase, authenticate, requireAdmin, async (req, res) => {
  try {
    const [report, live] = await Promise.all([getPipelineReport(), getLiveBusReport()]);
    return res.json({ api: "available", mongodb: "connected", hdfs: "available", hbase: "available", mapreduce_output: "available", hive: "local_only_not_probed", telemetry: "available_local_hdfs_hbase", websocket: websocketServiceReady ? "available" : "not_started_by_this_server_instance", big_data_pipeline: "available", data_label: report.data_label, current_bus_count: live.buses.length });
  } catch {
    return res.json({ api: "available", mongodb: "connected", hdfs: "unavailable_or_unchecked", hbase: "unavailable_or_unchecked", mapreduce_output: "unavailable_or_unchecked", hive: "local_only_not_probed", telemetry: "unavailable", websocket: websocketServiceReady ? "available" : "not_started_by_this_server_instance", big_data_pipeline: "unavailable", current_bus_count: null });
  }
});

app.use((req, res) => {
  res.status(404).json({ error: "not_found", path: req.path });
});

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error?.type === "entity.parse.failed") return res.status(400).json({ error: "invalid_json" });
  console.error("[BUSBEST API] Request failed:", error?.message || "unknown error");
  return res.status(500).json({ error: "internal_server_error" });
});

function startServer() {
  const server = http.createServer(app);
  attachWebSocket(server);
  let statusTimer;
  server.listen(PORT, HOST, () => {
    console.log(`BUSBEST API listening at http://${HOST}:${PORT}`);
    console.log(`CORS origins: ${corsOrigins.join(", ") || "none"}`);
    console.log(`Data source: Ubuntu WSL (${WSL_DISTRO}); cache ${DATA_CACHE_MS} ms`);
    statusTimer = setInterval(() => {
      if (websocketClients.size) getLiveBusReport().then((report) => publish({ type: "snapshot", ...report })).catch(() => {});
    }, 30_000);
    statusTimer.unref();
    // Prime the existing MapReduce speed cache off the map request path. The
    // lightweight live endpoint never waits on or repeatedly invokes HDFS.
    const warmTimer = setTimeout(async () => {
      try { await getLiveBusReport(); }
      catch (error) { console.warn(`[BUSBEST background live-state warm] ${error.code || error.name || "unavailable"}`); }
      try { await getPipelineReport(); }
      catch (error) { console.warn(`[BUSBEST background analytics warm] ${error.code || error.name || "unavailable"}`); }
    }, 1000);
    warmTimer.unref();
    server.on("close", () => clearTimeout(warmTimer));
  });
  server.on("close", () => { if (statusTimer) clearInterval(statusTimer); });
  connectDatabase().catch(() => {
    console.warn("[BUSBEST API] MongoDB is unavailable; public Big Data endpoints remain available, application-data endpoints return 503.");
  });
  return server;
}

if (require.main === module) startServer();

module.exports = { app, startServer, attachWebSocket, getPipelineReport, getLiveBusReport, clearPipelineCache, ingestTelemetry, publish };
