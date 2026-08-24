// Structural "what kind of change is this" classification for a pull
// request, derived purely from the paths GitHub reports as changed. This is
// NOT semantic code analysis — it does not read file contents or understand
// what the code does. It is deterministic pattern matching over file paths,
// documented below so every area/signal is traceable to a specific rule.

export type ChangeArea =
  | "dependencies"
  | "ci"
  | "infrastructure"
  | "security"
  | "tests"
  | "documentation"
  | "source";

export type ChangeRisk = "low" | "medium" | "high";

export type ChangeProfile = {
  risk: ChangeRisk;
  /** Rough magnitude of the change: files touched plus a lines-changed term. See formula below. */
  blastRadius: number;
  areas: ChangeArea[];
  signals: string[];
};

export type ChangedFile = {
  path: string;
  additions: number;
  deletions: number;
};

// Each file is classified into exactly one area by matching these patterns
// in priority order (a Dockerfile is "infrastructure" even though it also
// contains no dependency manifest, etc.). First match wins.
const AREA_PATTERNS: Array<{ area: ChangeArea; pattern: RegExp }> = [
  {
    area: "security",
    pattern:
      /(^|\/)(.*secret.*|.*credential.*|.*\.pem|.*\.key|auth\/.*|security\/.*|permissions?\/.*|codeowners|security\.md)$/i,
  },
  {
    area: "ci",
    pattern:
      /(^|\/)(\.github\/workflows\/.+|\.circleci\/.+|\.gitlab-ci\.ya?ml|jenkinsfile|azure-pipelines\.ya?ml)$/i,
  },
  {
    area: "infrastructure",
    pattern:
      /(^|\/)(dockerfile[^/]*|docker-compose.*\.ya?ml|.*\.tf|.*\.tfvars|wrangler\.(jsonc|toml)|serverless\.ya?ml|k8s\/.+|deploy\/.+|helm\/.+|\.env(\..+)?)$/i,
  },
  {
    area: "dependencies",
    pattern:
      /(^|\/)(package(-lock)?\.json|pnpm-lock\.yaml|yarn\.lock|cargo\.(toml|lock)|go\.(mod|sum)|requirements.*\.txt|pipfile(\.lock)?|gemfile(\.lock)?|composer\.(json|lock))$/i,
  },
  {
    area: "tests",
    pattern: /(\.(test|spec)\.[a-z]+$)|(^|\/)(__tests__|tests?)\//i,
  },
  {
    area: "documentation",
    pattern: /\.md$|(^|\/)docs?\//i,
  },
];

const AREA_SIGNAL_LABEL: Record<Exclude<ChangeArea, "source">, string> = {
  dependencies: "Dependency files changed",
  ci: "CI/workflow files changed",
  infrastructure: "Infrastructure/configuration files changed",
  security: "Security-sensitive files changed",
  tests: "Test files changed",
  documentation: "Documentation files changed",
};

const LARGE_BLAST_RADIUS = 20;
const MAX_SIGNAL_PATHS = 3;

export function classifyFileArea(path: string): ChangeArea {
  for (const { area, pattern } of AREA_PATTERNS) {
    if (pattern.test(path)) return area;
  }
  return "source";
}

export function computeChangeProfile(input: {
  files: ChangedFile[];
  additions: number;
  deletions: number;
  /** Authoritative total file count; may exceed files.length when the file list was truncated. */
  changedFiles: number;
  filesTruncated?: boolean;
}): ChangeProfile {
  const byArea = new Map<ChangeArea, string[]>();
  for (const file of input.files) {
    const area = classifyFileArea(file.path);
    const paths = byArea.get(area) ?? [];
    paths.push(file.path);
    byArea.set(area, paths);
  }

  const areas = [...byArea.keys()].filter((area) => area !== "source").sort();
  const signals: string[] = [];
  for (const area of areas) {
    const paths = byArea.get(area) ?? [];
    const shown = paths.slice(0, MAX_SIGNAL_PATHS).join(", ");
    const overflow = paths.length - MAX_SIGNAL_PATHS;
    signals.push(
      `${AREA_SIGNAL_LABEL[area as Exclude<ChangeArea, "source">]}: ${shown}${overflow > 0 ? `, +${overflow} more` : ""}`,
    );
  }

  if (input.filesTruncated) {
    signals.push(
      "File list truncated by GitHub; area/risk detection only covers the first files returned.",
    );
  }

  const blastRadius =
    input.changedFiles + Math.round((input.additions + input.deletions) / 100);

  const isDocsOnly =
    input.files.length > 0 && areas.length === 1 && areas[0] === "documentation";

  let risk: ChangeRisk;
  if (isDocsOnly) {
    risk = "low";
    if (signals.length === 0) signals.push("Documentation-only change.");
  } else if (areas.includes("security")) {
    risk = "high";
  } else if (areas.includes("infrastructure") && areas.includes("ci")) {
    risk = "high";
  } else if (
    areas.includes("infrastructure") ||
    areas.includes("ci") ||
    areas.includes("dependencies")
  ) {
    risk = "medium";
  } else if (blastRadius >= LARGE_BLAST_RADIUS) {
    risk = "medium";
  } else {
    risk = "low";
  }

  if (signals.length === 0) {
    signals.push("No structurally notable files detected in this change.");
  }

  return { risk, blastRadius, areas, signals };
}
