"use strict";

const jwt = require("jsonwebtoken");
const User = require("../models/User");

function secretIsConfigured() {
  return typeof process.env.JWT_SECRET === "string" && Buffer.byteLength(process.env.JWT_SECRET, "utf8") >= 32;
}

function issueToken(user) {
  if (!secretIsConfigured()) throw new Error("JWT_SECRET is not configured");
  return jwt.sign({}, process.env.JWT_SECRET, { subject: String(user._id), expiresIn: "1h", issuer: "busbest-api", audience: "busbest-app" });
}

async function authenticate(req, res, next) {
  if (!secretIsConfigured()) return res.status(503).json({ error: "auth_not_configured", message: "Set a random JWT_SECRET of at least 32 bytes in backend/.env." });
  const header = req.get("authorization") || "";
  const match = /^Bearer ([^ ]+)$/i.exec(header);
  if (!match) return res.status(401).json({ error: "authentication_required" });
  try {
    const payload = jwt.verify(match[1], process.env.JWT_SECRET, { issuer: "busbest-api", audience: "busbest-app" });
    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).json({ error: "authentication_required" });
    req.user = user;
    next();
  } catch {
    res.status(401).json({ error: "authentication_required" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "ADMIN") return res.status(403).json({ error: "admin_required" });
  next();
}

function publicUser(user) {
  return { id: String(user._id), name: user.name, email: user.email, role: user.role, createdAt: user.createdAt };
}

module.exports = { authenticate, requireAdmin, issueToken, secretIsConfigured, publicUser };
