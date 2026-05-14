#!/usr/bin/env bash
# PostToolUse hook — run `tsc --noEmit` in the affected package after non-trivial
# edits to backend/src or frontend/src. Blocking on tsc failure via the Claude
# Code hook JSON-output protocol: on failure we emit a JSON object to stdout
# with {"decision":"block","reason":...,"hookSpecificOutput":{...}} which the
# Claude Code harness surfaces to the assistant and halts the agentic loop.
# The on-disk edit has already persisted; the block is feedback only, not a
# rollback. The full message is also mirrored to stderr for the user's terminal.
# When tsc passes, the hook is silent (exit 0, no stdout). The script itself
# always exits 0 because per the docs only exit-0 reliably parses stdout JSON.
# Doc source: https://code.claude.com/docs/en/hooks.md
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
  local tsc_output tsc_exit
  set +e
  tsc_output="$(cd "$repo_root/$pkg" && npx tsc --noEmit 2>&1)"
  tsc_exit=$?
  set -e
  if [ "$tsc_exit" -eq 0 ]; then
    return 0
  fi
  local err_count first_err reason
  err_count="$(printf '%s\n' "$tsc_output" | grep -cE ': error TS[0-9]+:' || true)"
  first_err="$(printf '%s\n' "$tsc_output" | grep -E ': error TS[0-9]+:' | head -n1 | cut -c1-200)"
  reason="[verify-on-src-edit] tsc failed in $pkg with ${err_count} error(s).
Run: cd $pkg && npx tsc --noEmit
First error: $first_err
--- full tsc output ---
$tsc_output"

  # User-visible channel: stderr for the terminal.
  printf '%s\n' "$reason" >&2

  # Assistant-visible channel: JSON to stdout per Claude Code hook protocol.
  REASON="$reason" python3 -c '
import json, os
r = os.environ["REASON"]
print(json.dumps({
    "decision": "block",
    "reason": r,
    "hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": r},
}))'
  return 1
}

# Fallback when heuristic logic errors out: still run tsc somewhere reasonable.
# Stops at the first failing package so we never emit more than one JSON object
# to stdout (the harness expects at most one structured response).
run_tsc_safe_fallback() {
  if [ -n "$DETECTED_PKG" ]; then
    run_tsc_in_pkg "$DETECTED_PKG" || true
  else
    if ! run_tsc_in_pkg "backend"; then
      :
    else
      run_tsc_in_pkg "frontend" || true
    fi
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
run_tsc_in_pkg "$DETECTED_PKG" || true
exit 0
