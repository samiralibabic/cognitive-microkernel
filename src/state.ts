import { mkdir, readFile, writeFile, appendFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";

export const ROOT = process.cwd();
export const STATE_DIR = path.join(ROOT, "state");

export async function ensureStateDir() {
  await mkdir(STATE_DIR, { recursive: true });
}

export function statePath(name: string) {
  return path.join(STATE_DIR, name);
}

export async function readJsonFile<T>(file: string, fallback: T): Promise<T> {
  await ensureStateDir();
  const p = statePath(file);
  if (!existsSync(p)) {
    await writeJsonFile(file, fallback);
    return fallback;
  }
  const raw = await readFile(p, "utf8");
  if (!raw.trim()) return fallback;
  return JSON.parse(raw) as T;
}

export async function writeJsonFile<T>(file: string, value: T): Promise<void> {
  await ensureStateDir();
  await writeFile(statePath(file), JSON.stringify(value, null, 2) + "\n", "utf8");
}

export async function appendJsonl(file: string, value: unknown): Promise<void> {
  await ensureStateDir();
  await appendFile(statePath(file), JSON.stringify(value) + "\n", "utf8");
}

export function nowIso() {
  return new Date().toISOString();
}

export function makeId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}
