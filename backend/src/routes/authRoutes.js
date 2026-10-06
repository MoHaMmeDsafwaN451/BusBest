"use strict";

const express = require("express");
const bcrypt = require("bcrypt");
const User = require("../models/User");
const { requireDatabase } = require("../db");
const { authenticate, issueToken, publicUser, secretIsConfigured } = require("../middleware/auth");

const authRouter = express.Router();
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const validText = (value, min, max) => typeof value === "string" && value.trim().length >= min && value.trim().length <= max;

authRouter.post("/register", requireDatabase, async (req, res) => {
  const { name, email, password } = req.body || {};
  if (!secretIsConfigured()) return res.status(503).json({ error: "auth_not_configured", message: "Set a random JWT_SECRET of at least 32 bytes in backend/.env." });
  if (!validText(name, 2, 80) || !validText(email, 3, 254) || !emailPattern.test(email.trim()) || typeof password !== "string" || Buffer.byteLength(password, "utf8") < 12 || Buffer.byteLength(password, "utf8") > 72) {
    return res.status(400).json({ error: "invalid_registration", message: "Provide a name, valid email, and password of 12 to 72 UTF-8 bytes." });
  }
  try {
    const user = await User.create({ name: name.trim(), email: email.trim().toLowerCase(), passwordHash: await bcrypt.hash(password, 12), role: "USER" });
    return res.status(201).json({ token: issueToken(user), user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "email_already_registered" });
    if (error.name === "ValidationError") return res.status(400).json({ error: "invalid_registration" });
    return res.status(500).json({ error: "registration_failed" });
  }
});

authRouter.post("/login", requireDatabase, async (req, res) => {
  const { email, password } = req.body || {};
  if (!secretIsConfigured()) return res.status(503).json({ error: "auth_not_configured", message: "Set a random JWT_SECRET of at least 32 bytes in backend/.env." });
  if (typeof email !== "string" || !emailPattern.test(email.trim()) || typeof password !== "string" || Buffer.byteLength(password, "utf8") > 72) return res.status(400).json({ error: "invalid_login" });
  const user = await User.findOne({ email: email.trim().toLowerCase() }).select("+passwordHash");
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) return res.status(401).json({ error: "invalid_credentials" });
  return res.json({ token: issueToken(user), user: publicUser(user) });
});

authRouter.get("/me", requireDatabase, authenticate, (req, res) => res.json({ user: publicUser(req.user) }));

module.exports = { authRouter };
