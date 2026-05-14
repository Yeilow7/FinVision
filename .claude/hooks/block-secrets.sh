#!/usr/bin/env bash
# PreToolUse hook — block Edit/Write/MultiEdit on secret-bearing files.
# Reads the Claude Code hook payload from stdin, inspects tool_input.file_path,
# exits 2 (blocking, surfaces stderr to Claude) when the path matches a deny rule.

set -euo pipefail

payload="$(cat)"

file_path="$(printf '%s' "$payload" | python3 -c \
  'import sys, json; d=json.load(sys.stdin); print(d.get("tool_input",{}).get("file_path",""))' 2>/dev/null || echo "")"

# No file_path on this tool call — nothing to guard.
[ -z "$file_path" ] && exit 0

base="$(basename "$file_path")"

# Allowlist: .env.example must remain editable (it ships placeholders).
case "$base" in
  .env.example) exit 0 ;;
esac

# Denylist by basename.
case "$base" in
  .env|.env.local|.env.production|.env.development|.env.*.local)
    echo "BLOCKED: refusing to edit '$file_path' (env file containing real secrets). Edit .env.example for placeholders, or temporarily disable this hook in .claude/settings.json if intentional." >&2
    exit 2 ;;
  *.pem|*.key|id_rsa*|*service-account*.json|*credentials*.json)
    echo "BLOCKED: refusing to edit '$file_path' (looks like a key/credential file)." >&2
    exit 2 ;;
esac

# Denylist by path segment.
case "$file_path" in
  */secrets/*|*/credentials/*)
    echo "BLOCKED: refusing to edit '$file_path' (inside secrets/credentials directory)." >&2
    exit 2 ;;
esac

exit 0
