"use strict";

const mongoose = require("mongoose");

const stopSchema = new mongoose.Schema({
  stopId: { type: String, required: true, trim: true, maxlength: 40 },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  latitude: { type: Number, required: true, min: -90, max: 90 },
  longitude: { type: Number, required: true, min: -180, max: 180 },
  sequence: { type: Number, required: true, min: 1 },
}, { _id: false });

const routeSchema = new mongoose.Schema({
  routeId: { type: String, required: true, trim: true, maxlength: 40, unique: true, index: true },
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  start: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  destination: { type: String, required: true, trim: true, minlength: 2, maxlength: 120 },
  stops: { type: [stopSchema], default: [] },
  status: { type: String, enum: ["ACTIVE", "ARCHIVED"], default: "ACTIVE", required: true },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.models.Route || mongoose.model("Route", routeSchema);
