/**
 * Minimal semver utilities — just enough for bridge_api_version range checks.
 * No external dependencies.
 */

interface SemVer {
  major: number;
  minor: number;
  patch: number;
}

export function parse(version: string): SemVer | null {
  const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version.trim());
  if (!match) return null;
  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
  };
}

/**
 * Check if a range string is syntactically valid.
 * Supports: ">=X.Y.Z <A.B.C"
 */
export function validRange(range: string): boolean {
  return /^>=\d+\.\d+\.\d+\s+<\d+\.\d+\.\d+$/.test(range.trim());
}

/**
 * Check if `version` satisfies `range`.
 * Supports the format ">=X.Y.Z <A.B.C" (inclusive lower, exclusive upper).
 */
export function satisfies(version: string, range: string): boolean {
  const v = parse(version);
  if (!v) return false;

  const match = /^>=(\d+\.\d+\.\d+)\s+<(\d+\.\d+\.\d+)$/.exec(range.trim());
  if (!match) return false;

  const lower = parse(match[1]!);
  const upper = parse(match[2]!);
  if (!lower || !upper) return false;

  const vNum = v.major * 1_000_000 + v.minor * 1_000 + v.patch;
  const lNum = lower.major * 1_000_000 + lower.minor * 1_000 + lower.patch;
  const uNum = upper.major * 1_000_000 + upper.minor * 1_000 + upper.patch;

  return vNum >= lNum && vNum < uNum;
}
