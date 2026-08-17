import { loadNumberSet, saveNumberSet } from "./local-storage";

const KEY_PREFIX = "github-command-center:hidden-repos:v2";

export function loadHiddenRepos(scope: string): Set<number> {
  return loadNumberSet(`${KEY_PREFIX}:${scope}`);
}

export function saveHiddenRepos(scope: string, ids: Set<number>) {
  saveNumberSet(`${KEY_PREFIX}:${scope}`, ids);
}
