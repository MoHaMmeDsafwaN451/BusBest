"use strict";

const bcrypt = require("bcrypt");
const { connectDatabase } = require("../src/db");
const User = require("../src/models/User");

async function main() {
  const { BOOTSTRAP_ADMIN_NAME: name, BOOTSTRAP_ADMIN_EMAIL: email, BOOTSTRAP_ADMIN_PASSWORD: password } = process.env;
  if (!process.env.JWT_SECRET || Buffer.byteLength(process.env.JWT_SECRET, "utf8") < 32) throw new Error("JWT_SECRET must be at least 32 bytes.");
  if (!name || !email || !password || Buffer.byteLength(password, "utf8") < 12 || Buffer.byteLength(password, "utf8") > 72) throw new Error("Set BOOTSTRAP_ADMIN_NAME, BOOTSTRAP_ADMIN_EMAIL, and a 12 to 72 byte BOOTSTRAP_ADMIN_PASSWORD in the ignored backend/.env file.");
  await connectDatabase();
  if (await User.countDocuments() !== 0) throw new Error("Bootstrap is restricted to an empty users collection; use an existing admin to manage roles.");
  const user = await User.create({ name, email: email.trim().toLowerCase(), passwordHash: await bcrypt.hash(password, 12), role: "ADMIN" });
  console.log(`Created initial admin account ${user.email}. No password or hash was displayed.`);
}

main().catch((error) => { console.error(`Admin bootstrap failed: ${error.message}`); process.exitCode = 1; })
  .finally(async () => { const mongoose = require("mongoose"); await mongoose.disconnect(); });
