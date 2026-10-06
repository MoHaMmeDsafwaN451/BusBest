"use strict";

const mongoose = require("mongoose");

const locationSchema = new mongoose.Schema({
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  speed: { type: Number, min: 0, max: 160, default: null },
  heading: { type: Number, min: 0, max: 360, default: null },
  accuracy: { type: Number, required: true, min: 0, max: 100 },
  timestamp: { type: Date, required: true },
}, { _id: false });

const trackingSessionSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  bus: { type: mongoose.Schema.Types.ObjectId, ref: "Bus", default: null, index: true },
  busId: { type: String, required: true, index: true },
  routeId: { type: String, default: null, index: true },
  status: { type: String, enum: ["ACTIVE", "STOPPED"], default: "ACTIVE", required: true, index: true },
  startedAt: { type: Date, required: true, default: Date.now },
  consentAt: { type: Date, required: true, default: Date.now },
  endedAt: { type: Date, default: null },
  previous: { type: locationSchema, select: false, default: null },
  latest: { type: locationSchema, select: false, default: null },
}, { timestamps: true, versionKey: false });

trackingSessionSchema.index({ endedAt: 1 }, { expireAfterSeconds: 30 * 24 * 60 * 60, partialFilterExpression: { status: "STOPPED" } });
trackingSessionSchema.index({ user: 1 }, { unique: true, partialFilterExpression: { status: "ACTIVE" } });

module.exports = mongoose.models.TrackingSession || mongoose.model("TrackingSession", trackingSessionSchema);
