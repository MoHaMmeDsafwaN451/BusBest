"use strict";

const mongoose = require("mongoose");

const busSchema = new mongoose.Schema({
  busId: { type: String, required: true, trim: true, maxlength: 40, unique: true, index: true },
  name: { type: String, trim: true, maxlength: 100, default: "" },
  registrationNumber: { type: String, trim: true, maxlength: 40, default: "" },
  routeId: { type: String, required: true, trim: true, maxlength: 40, index: true },
  owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  permittedManagers: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  status: { type: String, enum: ["PENDING_REVIEW", "ACTIVE", "SUSPENDED", "REJECTED"], default: "PENDING_REVIEW", required: true },
  trackingStatus: { type: String, enum: ["DEMO", "LIVE", "LIMITED_DATA", "STALE", "NO_LIVE_DATA"], default: "NO_LIVE_DATA", required: true },
  lastState: {
    latitude: { type: Number, min: -90, max: 90 },
    longitude: { type: Number, min: -180, max: 180 },
    speed: { type: Number, min: 0, max: 160 },
    accuracy: { type: Number, min: 0 },
    heading: { type: Number, min: 0, max: 360 },
    timestamp: Date,
    source: { type: String, enum: ["SIMULATED DEMO DATA", "LIVE CROWD TELEMETRY"] },
    contributorCount: { type: Number, min: 0, default: 0 },
    confidence: { type: String, enum: ["LOW", "MEDIUM", "HIGH"] },
  },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.models.Bus || mongoose.model("Bus", busSchema);
