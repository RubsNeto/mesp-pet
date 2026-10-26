import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { join, dirname } from 'node:path';
import process from 'node:process';
import { normalizeProviderPriority } from './dockRouterPriority.mjs';
import { normalizeVerification } from './dockModelVerification.mjs';

/** Stored next to the router's Auto health cache, so the router child reads it per request. */
export function providerPriorityFile(dataDir) {
  return join(dataDir, 'runtime', 'mesp-provider-priority.json');
}

export function readProviderPriority(dataDir) {
  if (!dataDir) return [];
  try {
    return normalizeProviderPriority(
      JSON.parse(readFileSync(providerPriorityFile(dataDir), 'utf8')),
    );
  } catch {
    return [];
  }
}

export function writeProviderPriority(dataDir, value) {
  const priority = normalizeProviderPriority(value);
  const file = providerPriorityFile(dataDir);
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(priority), 'utf8');
  renameSync(temporary, file);
  return priority;
}

/** Real test results per account and model, kept next to the router's other MESP state. */
export function modelVerificationFile(dataDir) {
  return join(dataDir, 'runtime', 'mesp-model-verification.json');
}

export function readModelVerification(dataDir) {
  if (!dataDir) return {};
  try {
    return normalizeVerification(JSON.parse(readFileSync(modelVerificationFile(dataDir), 'utf8')));
  } catch {
    return {};
  }
}

export function writeModelVerification(dataDir, value) {
  const store = normalizeVerification(value);
  const file = modelVerificationFile(dataDir);
  mkdirSync(dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.tmp`;
  writeFileSync(temporary, JSON.stringify(store), 'utf8');
  renameSync(temporary, file);
  return store;
}
