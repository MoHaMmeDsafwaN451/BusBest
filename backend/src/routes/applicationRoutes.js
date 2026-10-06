"use strict";

const express = require("express");
const mongoose = require("mongoose");
const Bus = require("../models/Bus");
const Route = require("../models/Route");
const User = require("../models/User");
const { requireDatabase } = require("../db");
const { authenticate, requireAdmin, publicUser } = require("../middleware/auth");

const busManagementRouter = express.Router();
const adminRouter = express.Router();
const myRouter = express.Router();
const registryRouter = express.Router();
const text = (v, min = 1, max = 100) => typeof v === "string" && v.trim().length >= min && v.trim().length <= max;
const clean = (v) => v.trim();
const busView = (bus) => ({ id: String(bus._id), busId: bus.busId, name: bus.name, registrationNumber: bus.registrationNumber || "", routeId: bus.routeId, ownerId: String(bus.owner), permittedManagerIds: (bus.permittedManagers || []).map(String), status: bus.status, trackingStatus: bus.trackingStatus, lastState: bus.lastState, createdAt: bus.createdAt, updatedAt: bus.updatedAt });
const routeView = (route, busCount = undefined) => ({ id: String(route._id), routeId: route.routeId, name: route.name, start: route.start, destination: route.destination, stops: [...(route.stops || [])].sort((a, b) => a.sequence - b.sequence), status: route.status || "ACTIVE", ...(busCount === undefined ? {} : { busCount }), createdAt: route.createdAt, updatedAt: route.updatedAt });
function validStops(stops) {
  return Array.isArray(stops) && stops.length <= 300 && stops.every((stop, index) =>
    stop && typeof stop.stopId === "string" && /^[A-Za-z0-9._-]{1,40}$/.test(stop.stopId) &&
    text(stop.name, 2, 100) && typeof stop.latitude === "number" && Number.isFinite(stop.latitude) && stop.latitude >= -90 && stop.latitude <= 90 &&
    typeof stop.longitude === "number" && Number.isFinite(stop.longitude) && stop.longitude >= -180 && stop.longitude <= 180 &&
    stop.sequence === index + 1) && new Set(stops.map((stop) => stop.stopId)).size === stops.length;
}

myRouter.get("/buses", requireDatabase, authenticate, async (req, res) => {
  const filter = req.user.role === "ADMIN" ? {} : { $or: [{ owner: req.user._id }, { permittedManagers: req.user._id }] };
  const buses = await Bus.find(filter).sort({ createdAt: -1 }).lean();
  res.json({ count: buses.length, buses: buses.map(busView) });
});

registryRouter.get("/routes", requireDatabase, async (req, res) => {
  const routes = await Route.find({ status: "ACTIVE" }).sort({ routeId: 1 }).lean();
  res.json({ count: routes.length, routes: routes.map(routeView) });
});

busManagementRouter.post("/", requireDatabase, authenticate, async (req, res) => {
  const { busId, name = "", routeId, registrationNumber = "" } = req.body || {};
  if (!text(busId, 1, 40) || !text(routeId, 1, 40) || !text(name, 0, 100) || !text(registrationNumber, 0, 40)) return res.status(400).json({ error: "invalid_bus" });
  try {
    const bus = await Bus.create({ busId: clean(busId), name: clean(name), registrationNumber: clean(registrationNumber), routeId: clean(routeId), owner: req.user._id, status: "PENDING_REVIEW" });
    return res.status(201).json({ bus: busView(bus) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "bus_id_already_registered" });
    if (error.name === "ValidationError") return res.status(400).json({ error: "invalid_bus" });
    return res.status(500).json({ error: "bus_create_failed" });
  }
});

busManagementRouter.put("/:busId", requireDatabase, authenticate, async (req, res) => {
  const bus = await Bus.findOne({ busId: req.params.busId });
  if (!bus) return res.status(404).json({ error: "application_bus_not_found" });
  const isAdmin = req.user.role === "ADMIN";
  const permitted = String(bus.owner) === String(req.user._id) || bus.permittedManagers.some((id) => String(id) === String(req.user._id));
  if (!isAdmin && !permitted) return res.status(403).json({ error: "bus_management_forbidden" });
  const body = req.body || {};
  if (Object.keys(body).some((key) => !["name", "routeId", "registrationNumber", ...(isAdmin ? ["status", "permittedUserIds"] : [])].includes(key)) ||
      ("name" in body && !text(body.name, 0, 100)) || ("routeId" in body && !text(body.routeId, 1, 40)) ||
      ("registrationNumber" in body && !text(body.registrationNumber, 0, 40)) ||
      ("status" in body && !["PENDING_REVIEW", "ACTIVE", "SUSPENDED", "REJECTED"].includes(body.status)) ||
      ("permittedUserIds" in body && (!Array.isArray(body.permittedUserIds) || body.permittedUserIds.length > 100 || body.permittedUserIds.some((id) => !mongoose.isValidObjectId(id))))) {
    return res.status(400).json({ error: "invalid_bus_update" });
  }
  if ("permittedUserIds" in body) {
    const ids = [...new Set(body.permittedUserIds.map(String))];
    if (ids.includes(String(bus.owner))) return res.status(400).json({ error: "owner_already_has_access" });
    if (await User.countDocuments({ _id: { $in: ids } }) !== ids.length) return res.status(400).json({ error: "permitted_user_not_found" });
    bus.permittedManagers = ids;
  }
  if ("name" in body) bus.name = clean(body.name);
  if ("routeId" in body) bus.routeId = clean(body.routeId);
  if ("registrationNumber" in body) bus.registrationNumber = clean(body.registrationNumber);
  if ("status" in body) bus.status = body.status;
  try { await bus.save(); return res.json({ bus: busView(bus) }); }
  catch (error) { return res.status(error.code === 11000 ? 409 : 400).json({ error: "bus_update_failed" }); }
});

busManagementRouter.delete("/:busId", requireDatabase, authenticate, async (req, res) => {
  const bus = await Bus.findOne({ busId: req.params.busId });
  if (!bus) return res.status(404).json({ error: "application_bus_not_found" });
  const permitted = req.user.role === "ADMIN" || String(bus.owner) === String(req.user._id) || bus.permittedManagers.some((id) => String(id) === String(req.user._id));
  if (!permitted) return res.status(403).json({ error: "bus_management_forbidden" });
  await bus.deleteOne();
  return res.sendStatus(204);
});

adminRouter.use(requireDatabase, authenticate, requireAdmin);

adminRouter.get("/users", async (req, res) => {
  const users = await User.find().sort({ createdAt: 1, _id: 1 });
  res.json({ count: users.length, users: users.map(publicUser) });
});

adminRouter.put("/users/:id/role", async (req, res) => {
  const { role } = req.body || {};
  if (!mongoose.isValidObjectId(req.params.id) || !["USER", "ADMIN"].includes(role)) return res.status(400).json({ error: "invalid_role_update" });
  if (String(req.user._id) === req.params.id && role !== "ADMIN") return res.status(409).json({ error: "cannot_change_own_admin_role" });
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: "user_not_found" });
  if (target.role === "ADMIN" && role !== "ADMIN" && await User.countDocuments({ role: "ADMIN" }) <= 1) return res.status(409).json({ error: "cannot_remove_last_admin" });
  target.role = role;
  await target.save();
  res.json({ user: publicUser(target) });
});

adminRouter.delete("/users/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id)) return res.status(400).json({ error: "invalid_user_id" });
  if (String(req.user._id) === req.params.id) return res.status(409).json({ error: "cannot_delete_own_account" });
  const target = await User.findById(req.params.id);
  if (!target) return res.status(404).json({ error: "user_not_found" });
  if (target.role === "ADMIN" && await User.countDocuments({ role: "ADMIN" }) <= 1) return res.status(409).json({ error: "cannot_delete_last_admin" });
  await Promise.all([Bus.deleteMany({ owner: target._id }), Bus.updateMany({ permittedManagers: target._id }, { $pull: { permittedManagers: target._id } })]);
  await target.deleteOne();
  res.sendStatus(204);
});

adminRouter.get("/buses", async (req, res) => {
  const buses = await Bus.find().sort({ createdAt: -1 }).lean();
  res.json({ count: buses.length, buses: buses.map(busView) });
});

adminRouter.get("/routes", async (req, res) => {
  const routes = await Route.find().sort({ routeId: 1 }).lean();
  const buses = await Bus.aggregate([{ $group: { _id: "$routeId", count: { $sum: 1 } } }]);
  const counts = new Map(buses.map((item) => [item._id, item.count]));
  res.json({ count: routes.length, routes: routes.map((route) => routeView(route, counts.get(route.routeId) || 0)) });
});

adminRouter.post("/routes", async (req, res) => {
  const { routeId, name, start, destination, stops = [] } = req.body || {};
  if (![text(routeId, 1, 40), text(name, 2, 100), text(start, 2, 120), text(destination, 2, 120), validStops(stops)].every(Boolean)) return res.status(400).json({ error: "invalid_route" });
  try {
    const route = await Route.create({ routeId: clean(routeId), name: clean(name), start: clean(start), destination: clean(destination), stops });
    res.status(201).json({ route: routeView(route) });
  } catch (error) {
    res.status(error.code === 11000 ? 409 : 400).json({ error: error.code === 11000 ? "route_id_already_exists" : "invalid_route" });
  }
});

adminRouter.put("/routes/:routeId", async (req, res) => {
  const route = await Route.findOne({ routeId: req.params.routeId });
  if (!route) return res.status(404).json({ error: "route_not_found" });
  const update = req.body || {};
  const { name, start, destination, stops, status } = update;
  if (Object.keys(update).length === 0 || Object.keys(update).some((key) => !["name", "start", "destination", "stops", "status"].includes(key)) ||
      ("name" in update && !text(name, 2, 100)) || ("start" in update && !text(start, 2, 120)) || ("destination" in update && !text(destination, 2, 120))) return res.status(400).json({ error: "invalid_route_update" });
  if (("stops" in update && !validStops(stops)) || ("status" in update && !["ACTIVE", "ARCHIVED"].includes(status))) return res.status(400).json({ error: "invalid_route_update" });
  for (const field of ["name", "start", "destination"]) if (field in update) route[field] = clean(update[field]);
  if ("stops" in update) route.stops = stops;
  if ("status" in update) route.status = status;
  await route.save();
  res.json({ route: routeView(route) });
});

adminRouter.delete("/routes/:routeId", async (req, res) => {
  const route = await Route.findOne({ routeId: req.params.routeId });
  if (!route) return res.status(404).json({ error: "route_not_found" });
  if (await Bus.exists({ routeId: route.routeId })) return res.status(409).json({ error: "route_in_use", message: "This route cannot be deleted because one or more buses are assigned to it. Archive the route or reassign those buses first." });
  await route.deleteOne();
  res.sendStatus(204);
});

module.exports = { busManagementRouter, adminRouter, myRouter, registryRouter };
