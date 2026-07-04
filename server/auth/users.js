// server/data/users.json 기반 계정 CRUD
import fs from "fs";
import crypto from "node:crypto";
import path from "path";
import url from "url";
import { hashPassword } from "./passwords.js";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const USERS_PATH = path.join(__dirname, "..", "data", "users.json");

const readJsonFile = (targetPath, fallback = null) => {
  if (!fs.existsSync(targetPath)) {
    return fallback;
  }

  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf-8"));
  } catch (error) {
    console.error(`Failed to parse JSON file: ${targetPath}`, error);
    return fallback;
  }
};

const writeJsonFile = (targetPath, value) => {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, JSON.stringify(value, null, 2), "utf-8");
};

const readUsers = () => {
  const users = readJsonFile(USERS_PATH, []);
  return Array.isArray(users) ? users : [];
};

const writeUsers = (users) => writeJsonFile(USERS_PATH, users);

const normalizeEmail = (email) => String(email ?? "").trim().toLowerCase();

export const listUsers = () => readUsers();

export const findUserByEmail = (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) return null;
  return readUsers().find((user) => normalizeEmail(user.email) === normalized) ?? null;
};

export const findUserById = (id) => {
  if (!id) return null;
  return readUsers().find((user) => user.id === id) ?? null;
};

export const createUser = ({ email, password, displayName }) => {
  const normalizedEmail = normalizeEmail(email);
  if (!normalizedEmail) throw new Error("Email is required.");
  if (!password) throw new Error("Password is required.");

  const users = readUsers();
  if (users.some((user) => normalizeEmail(user.email) === normalizedEmail)) {
    throw new Error("Email already in use.");
  }

  const user = {
    id: crypto.randomUUID(),
    email: normalizedEmail,
    passwordHash: hashPassword(password),
    displayName: String(displayName ?? "").trim() || normalizedEmail,
    createdAt: new Date().toISOString(),
  };

  users.push(user);
  writeUsers(users);
  return user;
};

export const setPassword = (userId, newPlainPassword) => {
  if (!newPlainPassword) throw new Error("New password is required.");

  const users = readUsers();
  const index = users.findIndex((user) => user.id === userId);
  if (index === -1) throw new Error("User not found.");

  users[index] = { ...users[index], passwordHash: hashPassword(newPlainPassword) };
  writeUsers(users);
  return users[index];
};
