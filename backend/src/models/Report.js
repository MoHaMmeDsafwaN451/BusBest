"use strict";

const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema({
  reporter: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  reportType: { type: String, enum: ["BUS_ISSUE", "ROUTE_ISSUE", "DATA_ISSUE", "SAFETY"], required: true },
  busId: { type: String, trim: true, maxlength: 40, default: "" },
  routeId: { type: String, trim: true, maxlength: 40, default: "" },
  description: { type: String, required: true, trim: true, minlength: 10, maxlength: 1200 },
  status: { type: String, enum: ["OPEN", "REVIEWED", "RESOLVED", "REJECTED"], default: "OPEN", required: true },
}, { timestamps: true, versionKey: false });

module.exports = mongoose.models.Report || mongoose.model("Report", reportSchema);
