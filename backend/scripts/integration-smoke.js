"use strict";

// Run against a locally running BUSBEST API and an otherwise clean app database.
// Creates one temporary USER, ADMIN and B106 app record, then removes only those fixtures.
const crypto = require("node:crypto");
const bcrypt = require("bcrypt");
const mongoose = require("mongoose");
const User = require("../src/models/User");
const Bus = require("../src/models/Bus");

const BASE = process.env.BUSBEST_API_URL || "http://127.0.0.1:3001/api";
const suffix = crypto.randomUUID();
const userEmail = `smoke-user-${suffix}@example.test`;
const adminEmail = `smoke-admin-${suffix}@example.test`;
const password = crypto.randomBytes(24).toString("base64url");
const checks = [];
let user;
let admin;

function check(condition, label) {
  if (!condition) throw new Error(`FAIL ${label}`);
  checks.push(label);
}

async function request(path, options = {}) {
  const headers = { ...(options.body === undefined ? {} : { "content-type": "application/json" }) };
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  return fetch(`${BASE}${path}`, {
    method: options.method || "GET",
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

async function login(email) {
  const response = await request("/auth/login", { method: "POST", body: { email, password } });
  check(response.status === 200, `${email.startsWith("smoke-user-") ? "USER" : "ADMIN"} login`);
  return (await response.json()).token;
}

async function main() {
  await mongoose.connect(process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/busbest");
  check(!(await Bus.exists({ busId: "B106" })), "B106 is unused before integration run");
  admin = await User.create({ name: "Temporary smoke admin", email: adminEmail, passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" });

  const health = await request("/health");
  check(health.status === 200 && (await health.json()).status === "ok", "visitor health endpoint");
  const publicBusesResponse = await request("/buses");
  check(publicBusesResponse.status === 200, "visitor public bus list");
  const publicBuses = await publicBusesResponse.json();
  check(publicBuses.count === 5 && publicBuses.data_label === "SIMULATED DEMO GPS DATA", "five source-labelled simulated HBase states");
  check(publicBuses.buses.every((bus) => Number.isFinite(bus.latitude) && Number.isFinite(bus.longitude)), "map data contains actual API coordinates");
  const liveResponse = await request("/live/buses");
  check(liveResponse.status === 200, "lightweight live map endpoint");
  const live = await liveResponse.json();
  check(live.count === 5 && live.buses.every((bus) => bus.data_label === "SIMULATED DEMO GPS DATA"), "light map rows preserve simulated-data labeling");
  const summaryResponse = await request("/analytics/summary");
  check(summaryResponse.status === 200, "visitor analytics summary");
  const summary = await summaryResponse.json();
  check(summary.historical_average_speed_by_bus.some((item) => item.bus_id === "B101" && item.average_speed_kmh === 29.67), "verified MapReduce analytics still served");
  const b104 = publicBuses.buses.find((bus) => bus.bus_id === "B104");
  check(b104 && b104.speed === 22 && b104.data_label === "SIMULATED DEMO GPS DATA", "B104 current state remains sourced from demo HBase data");

  const register = await request("/auth/register", { method: "POST", body: { name: "Temporary smoke user", email: userEmail, password } });
  check(register.status === 201, "USER registration");
  const registration = await register.json();
  user = await User.findById(registration.user.id);
  check(registration.user.role === "USER", "new registration receives USER role");
  const userToken = await login(userEmail);
  check((await request("/auth/me", { token: userToken })).status === 200, "authenticated USER profile");
  const addBus = await request("/buses", { method: "POST", token: userToken, body: { busId: "B106", name: "Integration smoke bus", routeId: "R01" } });
  check(addBus.status === 201 && (await addBus.json()).bus.status === "PENDING_REVIEW", "USER adds B106 through API");
  const duplicate = await request("/buses", { method: "POST", token: userToken, body: { busId: "B106", name: "Duplicate", routeId: "R01" } });
  check(duplicate.status === 409, "duplicate bus ID rejected");
  const mineResponse = await request("/my/buses", { token: userToken });
  const mine = await mineResponse.json();
  check(mineResponse.status === 200 && mine.buses.some((bus) => bus.busId === "B106"), "B106 appears in USER dashboard API data");
  check((await request("/admin/users", { token: userToken })).status === 403, "USER is denied admin API");

  const adminToken = await login(adminEmail);
  const adminUsers = await request("/admin/users", { token: adminToken });
  const users = await adminUsers.json();
  check(adminUsers.status === 200 && users.users.some((item) => item.email === userEmail), "ADMIN can list users");
  const activate = await request("/buses/B106", { method: "PUT", token: adminToken, body: { status: "ACTIVE" } });
  check(activate.status === 200 && (await activate.json()).bus.status === "ACTIVE", "ADMIN can activate B106");
  const adminBuses = await request("/admin/buses", { token: adminToken });
  const appBuses = await adminBuses.json();
  check(adminBuses.status === 200 && appBuses.buses.some((bus) => bus.busId === "B106" && bus.status === "ACTIVE"), "ADMIN can see application bus registry");
  check((await request("/admin/system", { token: adminToken })).status === 200, "ADMIN system status endpoint");
  const adminTracking = await request("/admin/tracking", { token: adminToken });
  check(adminTracking.status === 200, "ADMIN aggregate tracking status endpoint");
  const trackingState = await adminTracking.json();
  check(trackingState.buses.every((row) => !Object.hasOwn(row, "latitude") && !Object.hasOwn(row, "longitude") && !Object.hasOwn(row, "email")), "admin tracking response excludes precise passenger locations and identities");

  console.log(JSON.stringify({ result: "PASS", checks }, null, 2));
}

main()
  .catch((error) => {
    console.error(error.stack || error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (user?._id) await Bus.deleteMany({ busId: "B106", owner: user._id });
    if (user?._id) await user.deleteOne();
    if (admin?._id) await admin.deleteOne();
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
