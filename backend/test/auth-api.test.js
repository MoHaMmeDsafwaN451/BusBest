"use strict";

const { before, after, test } = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const WebSocket = require("ws");

process.env.JWT_SECRET = "test-only-secret-with-at-least-32-bytes-long";

let mongo;
let server;
let base;
let app;
let mongoose;
let User;
let bcrypt;
let serverModule;
let userToken;
let adminToken;
let userId;
let testBusId = "TEST-M3-BUS";

before(async () => {
  const { MongoMemoryServer } = require("mongodb-memory-server");
  mongo = await MongoMemoryServer.create();
  process.env.MONGODB_URI = mongo.getUri("busbest_test");
  mongoose = require("mongoose");
  User = require("../src/models/User");
  bcrypt = require("bcrypt");
  serverModule = require("../src/server");
  ({ app } = serverModule);
  await mongoose.connect(process.env.MONGODB_URI);
  server = http.createServer(app);
  serverModule.attachWebSocket(server);
  server.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  if (mongoose?.connection.readyState) await mongoose.disconnect();
  if (mongo) await mongo.stop();
});

async function request(path, { method = "GET", token, body } = {}) {
  const headers = {};
  if (body !== undefined) headers["content-type"] = "application/json";
  if (token) headers.authorization = `Bearer ${token}`;
  return fetch(`${base}${path}`, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
}

test("visitor public access keeps live pipeline endpoints available", async () => {
  const health = await request("/api/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");
  const legacyStarted = performance.now();
  const busesResponse = await request("/api/buses");
  const legacyElapsedMs = performance.now() - legacyStarted;
  assert.equal(busesResponse.status, 200);
  const buses = await busesResponse.json();
  assert.equal(buses.count, 5);
  assert.equal(buses.data_label, "SIMULATED DEMO GPS DATA");
  assert.ok(buses.buses.some((bus) => bus.bus_id === "B104"));
  const liveStarted = performance.now();
  const liveResponse = await request("/api/live/buses");
  const liveElapsedMs = performance.now() - liveStarted;
  assert.equal(liveResponse.status, 200);
  const live = await liveResponse.json();
  assert.equal(live.count, 5);
  assert.ok(live.buses.every((bus) => bus.data_label === "SIMULATED DEMO GPS DATA"));
  assert.ok(live.buses.some((bus) => bus.bus_id === "B101" && bus.tracking_status === "DEMO"));
  const warmStarted = performance.now();
  const warmLiveResponse = await request("/api/live/buses");
  const warmElapsedMs = performance.now() - warmStarted;
  assert.equal(warmLiveResponse.status, 200);
  assert.equal((await warmLiveResponse.json()).count, 5);
  console.log(`Actual API timings: legacy full bus endpoint ${legacyElapsedMs.toFixed(0)} ms; lightweight live endpoint ${liveElapsedMs.toFixed(0)} ms; cached live ${warmElapsedMs.toFixed(1)} ms. Both returned five buses labeled simulated demo data.`);
  const socket = new WebSocket(`ws://127.0.0.1:${server.address().port}/ws`, { origin: "http://localhost:5173" });
  const snapshot = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket snapshot timed out")), 20_000);
    socket.once("message", (message) => { clearTimeout(timeout); resolve(JSON.parse(message.toString())); });
    socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
  });
  assert.equal(snapshot.type, "snapshot");
  assert.equal(snapshot.count, 5);
  assert.ok(snapshot.buses.every((bus) => bus.data_label === "SIMULATED DEMO GPS DATA"));
  const broadcastPromise = new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error("WebSocket bus-state event timed out")), 3000);
    socket.once("message", (message) => { clearTimeout(timeout); resolve(JSON.parse(message.toString())); });
    socket.once("error", (error) => { clearTimeout(timeout); reject(error); });
  });
  const actualBus = live.buses.find((bus) => bus.bus_id === "B101");
  serverModule.publish({ type: "bus_state", bus: actualBus });
  const broadcast = await broadcastPromise;
  assert.equal(broadcast.type, "bus_state");
  assert.equal(broadcast.bus.latitude, actualBus.latitude);
  socket.close();
  const routes = await request("/api/routes");
  assert.equal(routes.status, 200);
  assert.equal((await routes.json()).count, 5);
  const analytics = await request("/api/analytics/summary");
  assert.equal(analytics.status, 200);
  const summary = await analytics.json();
  assert.equal(summary.current_bus_count, 5);
  assert.equal(summary.historical_average_speed_by_bus.find((item) => item.bus_id === "B101").average_speed_kmh, 29.67);
});

test("registration, duplicate rejection, and login validation", async () => {
  const payload = { name: "Demo User", email: "Case.User@example.test", password: "StrongPass123!" };
  const created = await request("/api/auth/register", { method: "POST", body: payload });
  assert.equal(created.status, 201);
  const registration = await created.json();
  assert.equal(registration.user.role, "USER");
  assert.equal(registration.user.email, "case.user@example.test");
  assert.ok(registration.token);
  assert.equal(Object.hasOwn(registration.user, "passwordHash"), false);
  const storedUser = await User.findById(registration.user.id).select("+passwordHash");
  assert.match(storedUser.passwordHash, /^\$2[aby]\$/);
  assert.equal(Object.hasOwn(storedUser.toObject(), "password"), false);
  userToken = registration.token;
  userId = registration.user.id;

  const duplicate = await request("/api/auth/register", { method: "POST", body: { ...payload, email: "case.user@example.test" } });
  assert.equal(duplicate.status, 409);

  const login = await request("/api/auth/login", { method: "POST", body: { email: payload.email, password: payload.password } });
  assert.equal(login.status, 200);
  userToken = (await login.json()).token;

  const wrongPassword = await request("/api/auth/login", { method: "POST", body: { email: payload.email, password: "WrongPassword123!" } });
  assert.equal(wrongPassword.status, 401);

  const me = await request("/api/auth/me", { token: userToken });
  assert.equal(me.status, 200);
  const profile = (await me.json()).user;
  assert.equal(profile.id, userId);
  assert.equal(profile.role, "USER");
  assert.equal(Object.hasOwn(profile, "passwordHash"), false);

  const report = await request("/api/reports", { method: "POST", token: userToken, body: { reportType: "DATA_ISSUE", busId: "B101", routeId: "R01", description: "The displayed update appears delayed." } });
  assert.equal(report.status, 201);
  assert.equal((await report.json()).report.status, "OPEN");
  assert.equal((await request("/api/reports/mine", { token: userToken })).status, 200);
  const invalidTelemetry = await request("/api/telemetry", { method: "POST", token: userToken, body: { bus_id: "B101", latitude: 95, longitude: 76, speed: 20, timestamp: new Date().toISOString(), consent: false } });
  assert.equal(invalidTelemetry.status, 400);
});

test("user bus ownership and role-based admin access", async () => {
  const added = await request("/api/buses", { method: "POST", token: userToken, body: { busId: testBusId, name: "Test owned bus", routeId: "R01" } });
  assert.equal(added.status, 201);
  const bus = (await added.json()).bus;
  assert.equal(bus.ownerId, userId);
  assert.equal(bus.status, "PENDING_REVIEW");
  const myBuses = await request("/api/my/buses", { token: userToken });
  assert.equal(myBuses.status, 200);
  assert.ok((await myBuses.json()).buses.some((item) => item.busId === testBusId));

  const visitorAdmin = await request("/api/admin/users");
  assert.equal(visitorAdmin.status, 401);
  const userAdmin = await request("/api/admin/users", { token: userToken });
  assert.equal(userAdmin.status, 403);

  const stranger = await request("/api/auth/register", { method: "POST", body: { name: "Other User", email: "other@example.test", password: "StrongPass456!" } });
  const strangerAccount = await stranger.json();
  const strangerToken = strangerAccount.token;
  assert.equal((await request(`/api/buses/${testBusId}`, { method: "PUT", token: strangerToken, body: { name: "Take over" } })).status, 403);
  assert.equal((await request(`/api/buses/${testBusId}`, { method: "DELETE", token: strangerToken })).status, 403);
  assert.equal((await request(`/api/buses/${testBusId}`, { method: "PUT", token: userToken, body: { name: "Updated test bus" } })).status, 200);
  assert.equal((await request(`/api/buses/${testBusId}`, { method: "PUT", token: userToken, body: { status: "ACTIVE" } })).status, 400);

  const admin = await User.create({ name: "Test Admin", email: "admin@example.test", passwordHash: await bcrypt.hash("AdminStrong456!", 12), role: "ADMIN" });
  const adminLogin = await request("/api/auth/login", { method: "POST", body: { email: admin.email, password: "AdminStrong456!" } });
  assert.equal(adminLogin.status, 200);
  adminToken = (await adminLogin.json()).token;
  const users = await request("/api/admin/users", { token: adminToken });
  assert.equal(users.status, 200);
  const list = await users.json();
  assert.equal(list.count, 3);
  assert.ok(list.users.every((item) => !Object.hasOwn(item, "passwordHash")));
  const roleChange = await request(`/api/admin/users/${strangerAccount.user.id}/role`, { method: "PUT", token: adminToken, body: { role: "ADMIN" } });
  assert.equal(roleChange.status, 200);
  assert.equal((await roleChange.json()).user.role, "ADMIN");
  assert.equal((await request("/api/admin/users", { token: strangerToken })).status, 200);
  const adminBuses = await request("/api/admin/buses", { token: adminToken });
  assert.equal(adminBuses.status, 200);
  assert.ok((await adminBuses.json()).buses.some((item) => item.busId === testBusId));
  const grant = await request(`/api/buses/${testBusId}`, { method: "PUT", token: adminToken, body: { status: "ACTIVE", permittedUserIds: [strangerAccount.user.id] } });
  assert.equal(grant.status, 200);
  assert.equal((await grant.json()).bus.status, "ACTIVE");
  const permittedList = await request("/api/my/buses", { token: strangerToken });
  assert.ok((await permittedList.json()).buses.some((item) => item.busId === testBusId));

  const missingConsent = await request("/api/tracking-sessions", { method: "POST", token: userToken, body: { bus_id: testBusId } });
  assert.equal(missingConsent.status, 400);
  const sessionResponse = await request("/api/tracking-sessions", { method: "POST", token: userToken, body: { bus_id: testBusId, consent: true } });
  assert.equal(sessionResponse.status, 201);
  const session = (await sessionResponse.json()).session;
  assert.equal(session.status, "ACTIVE");
  assert.equal((await request("/api/tracking-sessions/current", { token: userToken })).status, 200);
  const unauthorizedStop = await request(`/api/tracking-sessions/${session.id}/stop`, { method: "POST", token: strangerToken, body: {} });
  assert.equal(unauthorizedStop.status, 404);
  const invalidGps = await request("/api/telemetry", { method: "POST", token: userToken, body: { tracking_session_id: session.id, latitude: 9.59, longitude: 76.52, speed: 20, heading: 90, accuracy: 101, timestamp: new Date().toISOString() } });
  assert.equal(invalidGps.status, 400);
  const stopped = await request(`/api/tracking-sessions/${session.id}/stop`, { method: "POST", token: userToken, body: {} });
  assert.equal(stopped.status, 200);
  assert.match((await stopped.json()).message, /Previously accepted samples remain in de-identified HDFS history/);
  const currentAfterStop = await request("/api/tracking-sessions/current", { token: userToken });
  assert.equal((await currentAfterStop.json()).session, null);

  const route = await request("/api/admin/routes", { method: "POST", token: adminToken, body: { routeId: "TEST-R01", name: "Test Route", start: "Test Start", destination: "Test End" } });
  assert.equal(route.status, 201);
  assert.equal((await request("/api/admin/routes", { token: adminToken })).status, 200);
  const stopRoute = await request("/api/admin/routes", { method: "POST", token: adminToken, body: { routeId: "TEST-STOPS", name: "Stop Test Route", start: "Start Place", destination: "End Place", stops: [{ stopId: "S01", name: "Stop One", latitude: 9.6, longitude: 76.5, sequence: 1 }, { stopId: "S02", name: "Stop Two", latitude: 9.61, longitude: 76.51, sequence: 2 }] } });
  assert.equal(stopRoute.status, 201);
  const reorder = await request("/api/admin/routes/TEST-STOPS", { method: "PUT", token: adminToken, body: { stops: [{ stopId: "S02", name: "Stop Two", latitude: 9.61, longitude: 76.51, sequence: 1 }, { stopId: "S01", name: "Stop One", latitude: 9.6, longitude: 76.5, sequence: 2 }] } });
  assert.equal(reorder.status, 200);
  assert.equal((await reorder.json()).route.stops[0].stopId, "S02");
  const stopBus = await request("/api/buses", { method: "POST", token: userToken, body: { busId: "TEST-STOP-BUS", name: "Stop route bus", routeId: "TEST-STOPS" } });
  assert.equal(stopBus.status, 201);
  const blockedDelete = await request("/api/admin/routes/TEST-STOPS", { method: "DELETE", token: adminToken });
  assert.equal(blockedDelete.status, 409);
  assert.match((await blockedDelete.json()).message, /Archive the route/);
  const archived = await request("/api/admin/routes/TEST-STOPS", { method: "PUT", token: adminToken, body: { status: "ARCHIVED" } });
  assert.equal((await archived.json()).route.status, "ARCHIVED");
  const routesAfterArchive = await request("/api/registry/routes");
  assert.equal((await routesAfterArchive.json()).routes.some((item) => item.routeId === "TEST-STOPS"), false);
  assert.equal((await request("/api/buses/TEST-STOP-BUS", { method: "DELETE", token: userToken })).status, 204);
  assert.equal((await request("/api/admin/routes/TEST-STOPS", { method: "DELETE", token: adminToken })).status, 204);
  const publicRegistryRoutes = await request("/api/registry/routes");
  assert.equal(publicRegistryRoutes.status, 200);
  assert.ok((await publicRegistryRoutes.json()).routes.some((item) => item.routeId === "TEST-R01"));
  assert.equal((await request("/api/admin/routes/TEST-R01", { method: "DELETE", token: adminToken })).status, 204);
  const reports = await request("/api/admin/reports", { token: adminToken });
  assert.equal(reports.status, 200);
  const reportId = (await reports.json()).reports[0].id;
  assert.equal((await request(`/api/admin/reports/${reportId}`, { method: "PUT", token: adminToken, body: { status: "REVIEWED" } })).status, 200);
  const tracking = await request("/api/admin/tracking", { token: adminToken });
  assert.equal(tracking.status, 200);
  const trackingReport = await tracking.json();
  assert.ok(trackingReport.buses.some((row) => row.bus_id === "B101"));
  assert.ok(trackingReport.buses.every((row) => !Object.hasOwn(row, "latitude") && !Object.hasOwn(row, "longitude") && !Object.hasOwn(row, "email")));
  const system = await request("/api/admin/system", { token: adminToken });
  assert.equal(system.status, 200);
  assert.equal((await system.json()).mongodb, "connected");
  assert.equal((await request("/api/admin/users/not-an-id/role", { method: "PUT", token: adminToken, body: { role: "ADMIN" } })).status, 400);
});
