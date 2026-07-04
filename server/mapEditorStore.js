/*!
 * Open Historia Map Editor
 * Copyright (c) 2026 Nicholas Krol - MIT License (see src/Editor/LICENSE).
 */

// Persistence for map-editor documents (the maps authored in /?editor=1).
// Mirrors the scenario-store idioms in libraryStore.js but is fully self-contained
// so libraryStore stays untouched. Each document is a single JSON file under
// server/data/mapeditor-documents/, tracked by server/data/mapeditor-manifest.json.

import fs from "fs";
import path from "path";
import url from "url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DATA_DIR = path.join(__dirname, "data");
const DOCS_DIR = path.join(DATA_DIR, "mapeditor-documents");
const MANIFEST_PATH = path.join(DATA_DIR, "mapeditor-manifest.json");

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const readJson = (target, fallback) => {
  try {
    return JSON.parse(fs.readFileSync(target, "utf8"));
  } catch {
    return fallback;
  }
};

const writeJson = (target, value) => {
  ensureDir(path.dirname(target));
  fs.writeFileSync(target, JSON.stringify(value));
};

const normalizeId = (raw, fallback = "map") => {
  const base = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || fallback;
};

const docPath = (id) => path.join(DOCS_DIR, `${id}.json`);

const getManifest = () => {
  const m = readJson(MANIFEST_PATH, null);
  return m && Array.isArray(m.order) ? { version: 1, order: m.order } : { version: 1, order: [] };
};

const saveManifest = (manifest) => {
  writeJson(MANIFEST_PATH, { version: 1, order: Array.from(new Set(manifest.order ?? [])) });
};

const uniqueId = (desired) => {
  let id = desired;
  let n = 2;
  while (fs.existsSync(docPath(id))) id = `${desired}-${n++}`;
  return id;
};

// Bootstrap only — doesn't touch ownership, so (like libraryStore.js's
// ensureScenarioStore/ensureGameStore) it takes no userId.
export const ensureMapEditorStore = () => {
  ensureDir(DOCS_DIR);
  if (!fs.existsSync(MANIFEST_PATH)) saveManifest({ order: [] });
};

const summarize = (doc) => ({
  id: doc.id,
  name: doc.name || doc.metadata?.name || "Untitled Map",
  kind: doc.metadata?.kind || "import-world",
  regionCount: doc.regions?.features?.length ?? 0,
  featureCount: doc.features?.length ?? 0,
  typeCount: doc.types?.length ?? 0,
  ownerId: doc.ownerId,
  shared: doc.shared === true,
  updatedAt: doc.updatedAt,
  createdAt: doc.createdAt,
});

// Fail-closed: a document with neither ownerId===userId nor shared:true is
// invisible, same rule as scenarios in libraryStore.js.
const requireUserId = (userId) => {
  if (!userId) throw new Error("userId is required");
  return String(userId);
};

const isVisible = (doc, userId) => Boolean(doc) && (doc.ownerId === userId || doc.shared === true);
const isOwned = (doc, userId) => Boolean(doc) && doc.ownerId === userId;

export const getMapEditorCatalog = (userId) => {
  requireUserId(userId);
  const manifest = getManifest();
  return manifest.order
    .map((id) => {
      const doc = readJson(docPath(id), null);
      return isVisible(doc, userId) ? summarize(doc) : null;
    })
    .filter(Boolean);
};

// Read-only access requires VISIBILITY (owner or shared).
export const getMapEditorDocument = (userId, id) => {
  requireUserId(userId);
  const doc = readJson(docPath(id), null);
  if (!isVisible(doc, userId)) throw new Error(`Map document not found: ${id}`);
  return doc;
};

// Mutations (update/delete) require OWNERSHIP — shared means readable by
// everyone, not editable by everyone (same rule as scenarios).
const requireOwnedDocument = (userId, id) => {
  const doc = readJson(docPath(id), null);
  if (!isOwned(doc, userId)) throw new Error(`Map document not found: ${id}`);
  return doc;
};

export const createMapEditorDocument = (userId, body = {}) => {
  requireUserId(userId);
  ensureMapEditorStore();
  const now = new Date().toISOString();
  const name = String(body.name || body.metadata?.name || "Untitled Map").trim() || "Untitled Map";
  const id = uniqueId(normalizeId(body.id || name));
  const doc = {
    id,
    name,
    version: 1,
    metadata: { ...(body.metadata || {}), name },
    types: body.types || [],
    regions: body.regions || { type: "FeatureCollection", features: [] },
    features: body.features || [],
    // New content is private by default — no UI exists yet to mark it shared
    // (mirrors createScenario's `shared` opt-in in libraryStore.js).
    ownerId: userId,
    shared: body.shared === true,
    createdAt: now,
    updatedAt: now,
  };
  writeJson(docPath(id), doc);
  const manifest = getManifest();
  manifest.order = [id, ...manifest.order.filter((x) => x !== id)];
  saveManifest(manifest);
  return doc;
};

export const updateMapEditorDocument = (userId, id, updates = {}) => {
  requireUserId(userId);
  const existing = requireOwnedDocument(userId, id);
  const doc = {
    ...existing,
    ...updates,
    id,
    ownerId: existing.ownerId,
    shared: typeof updates.shared === "boolean" ? updates.shared : existing.shared,
    name: String(updates.name || updates.metadata?.name || existing.name).trim() || existing.name,
    metadata: { ...existing.metadata, ...(updates.metadata || {}) },
    updatedAt: new Date().toISOString(),
  };
  writeJson(docPath(id), doc);
  const manifest = getManifest();
  if (!manifest.order.includes(id)) {
    manifest.order = [id, ...manifest.order];
    saveManifest(manifest);
  }
  return doc;
};

export const deleteMapEditorDocument = (userId, id) => {
  requireUserId(userId);
  requireOwnedDocument(userId, id);
  if (fs.existsSync(docPath(id))) fs.rmSync(docPath(id));
  const manifest = getManifest();
  manifest.order = manifest.order.filter((x) => x !== id);
  saveManifest(manifest);
  return { id, deleted: true };
};
