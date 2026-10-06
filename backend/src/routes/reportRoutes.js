"use strict";

const express = require("express");
const mongoose = require("mongoose");
const Report = require("../models/Report");
const { requireDatabase } = require("../db");
const { authenticate, requireAdmin } = require("../middleware/auth");

const reportsRouter = express.Router();
const adminReportsRouter = express.Router();
const TYPES = ["BUS_ISSUE", "ROUTE_ISSUE", "DATA_ISSUE", "SAFETY"];
const STATUSES = ["OPEN", "REVIEWED", "RESOLVED", "REJECTED"];
const view = (r) => ({ id: String(r._id), reporterId: String(r.reporter), reportType: r.reportType, busId: r.busId, routeId: r.routeId, description: r.description, status: r.status, createdAt: r.createdAt, updatedAt: r.updatedAt });

reportsRouter.use(requireDatabase, authenticate);
reportsRouter.post("/", async (req, res) => {
  const { reportType, busId = "", routeId = "", description } = req.body || {};
  if (!TYPES.includes(reportType) || typeof busId !== "string" || busId.length > 40 || typeof routeId !== "string" || routeId.length > 40 || typeof description !== "string" || description.trim().length < 10 || description.trim().length > 1200) return res.status(400).json({ error: "invalid_report" });
  const report = await Report.create({ reporter: req.user._id, reportType, busId: busId.trim(), routeId: routeId.trim(), description: description.trim() });
  res.status(201).json({ report: view(report) });
});
reportsRouter.get("/mine", async (req, res) => {
  const reports = await Report.find({ reporter: req.user._id }).sort({ createdAt: -1 }).limit(100);
  res.json({ count: reports.length, reports: reports.map(view) });
});

adminReportsRouter.use(requireDatabase, authenticate, requireAdmin);
adminReportsRouter.get("/", async (req, res) => {
  const reports = await Report.find().sort({ createdAt: -1 }).limit(500);
  res.json({ count: reports.length, reports: reports.map(view) });
});
adminReportsRouter.put("/:id", async (req, res) => {
  if (!mongoose.isValidObjectId(req.params.id) || !STATUSES.includes(req.body?.status) || Object.keys(req.body || {}).some((key) => key !== "status")) return res.status(400).json({ error: "invalid_report_update" });
  const report = await Report.findByIdAndUpdate(req.params.id, { status: req.body.status }, { returnDocument: "after", runValidators: true });
  if (!report) return res.status(404).json({ error: "report_not_found" });
  res.json({ report: view(report) });
});

module.exports = { reportsRouter, adminReportsRouter };
