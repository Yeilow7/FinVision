#!/usr/bin/env bash
# PostToolUse hook — run `tsc --noEmit` in the affected package after non-trivial
# edits to backend/src or frontend/src. Non-blocking: surfaces errors to stderr,
# always exits 0.
#
# Safety bias: when in doubt, RUN tsc. Only two paths skip tsc:
#   A) File is clearly out of scope (not a .ts/.tsx in backend/src or frontend/src).
#   B) The triviality heuristic ran cleanly AND found zero substantive lines —
#      i.e., the diff against HEAD contains only comments/whitespace, on a file
#      that's already git-tracked.
# Any unexpected error (missing git, parse failure, regex error, etc.) is caught
# by an ERR trap that runs tsc as a safe fallback rather than silently skipping.

set -euo pipefail

repo_root="$(cd "$(dirname "$0")/../.." && pwd)"
DETECTED_PKG=""

run_tsc_in_pkg() {
  local pkg="$1"
  if ! (cd "$repo_root/$pkg" && npx tsc --noEmit) >&2; then
    echo "[verify-on-src-edit] tsc --noEmit failed in $pkg. Hook is non-blocking; fix before claiming done." >&2
  fi
}

# Fallback when heuristic logic errors out: still run tsc somewhere reasonable.
run_tsc_safe_fallback() {
  if [ -n "$DETECTED_PKG" ]; then
    run_tsc_in_pkg "$DETECTED_PKG"
  else
    run_tsc_in_pkg "backend"
    run_tsc_in_pkg "frontend"
  fi
  exit 0
}

trap run_tsc_safe_fallback ERR

# --- Parse payload ---
payload="$(cat)"
file_path="$(printf '%s' "$payload" | python3 -c \
  'import sys, json; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))')"

# --- Scope check (Path A) ---
case "$file_path" in
  "$repo_root"/backend/src/*) DETECTED_PKG="backend" ;;
  "$repo_root"/frontend/src/*) DETECTED_PKG="frontend" ;;
  *)
    trap - ERR
    exit 0 ;;
esac

case "$file_path" in
  *.ts|*.tsx) ;;
  *)
    trap - ERR
    exit 0 ;;
esac

# --- Triviality heuristic. Errors here fall through to the ERR trap → tsc. ---
# Untracked file (e.g., just created by Write): bypass heuristic, treat as substantive.
if git -C "$repo_root" ls-files --error-unmatch "$file_path" >/dev/null 2>&1; then
  diff_output="$(git -C "$repo_root" diff -U0 -- "$file_path")"
  substantive="$(printf '%s\n' "$diff_output" \
    | grep -E '^[+-][^+-]' \
    | grep -cvE '^[+-][[:space:]]*(//|/\*|\*/?|$)' || true)"

  if [ "${substantive:-1}" -eq 0 ]; then
    # Path B: only comments/whitespace changed. Skip tsc.
    trap - ERR
    exit 0
  fi
fi

# --- Substantive change (or new untracked file) → run tsc. ---
trap - ERR
run_tsc_in_pkg "$DETECTED_PKG"
exit 0
