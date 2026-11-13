// Shared managed-data law. Keep this expression identical to the original
// engine export; validating an installed Codex binding belongs to its caller.
import path from 'node:path';
import os from 'node:os';

export function dataDir() {
  return process.env.COMPANY_PLUGIN_DATA || process.env.PLUGIN_DATA || process.env.CLAUDE_PLUGIN_DATA || path.join(os.homedir(),'.cache','soloco');
}
