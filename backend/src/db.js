"use strict";

const mongoose = require("mongoose");

let pendingConnection = null;

function connectDatabase() {
  if (mongoose.connection.readyState === 1) return Promise.resolve(mongoose);
  if (pendingConnection) return pendingConnection;
  const uri = process.env.MONGODB_URI;
  if (!uri) return Promise.reject(new Error("MONGODB_URI is not configured"));
  pendingConnection = mongoose.connect(uri, { serverSelectionTimeoutMS: 2500 })
    .finally(() => { pendingConnection = null; });
  return pendingConnection;
}

async function requireDatabase(req, res, next) {
  try {
    await connectDatabase();
    next();
  } catch {
    res.status(503).json({ error: "application_data_unavailable", message: "Local MongoDB is unavailable or not configured." });
  }
}

module.exports = { connectDatabase, requireDatabase };
