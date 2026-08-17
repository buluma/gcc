import { loadNumberSet, saveNumberSet } from "./local-storage";

const KEY_PREFIX = "github-command-center:dismissed-runs:v2";
const LIMIT = 300;

export function loadDismissedRuns(scope: string): Set<number> {
  return loadNumberSet(`${KEY_PREFIX}:${scope}`);
}

export function saveDismissedRuns(scope: string, ids: Set<number>) {
  saveNumberSet(`${KEY_PREFIX}:${scope}`, ids, LIMIT);
}
