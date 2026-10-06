"use strict";

const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 80 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254, unique: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  role: { type: String, enum: ["USER", "ADMIN"], default: "USER", required: true },
}, { timestamps: { createdAt: true, updatedAt: false }, versionKey: false });

module.exports = mongoose.models.User || mongoose.model("User", userSchema);
