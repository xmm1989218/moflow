#!/usr/bin/env bash
set -euo pipefail

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
NC='\033[0m'

FAILED=0

MODE="${1:-staged}"

if [ "$MODE" = "staged" ]; then
  FILES=$(git diff --cached --name-only --diff-filter=ACM 2>/dev/null || true)
  DIFF_CMD="git diff --cached"
elif [ "$MODE" = "ci" ]; then
  FILES=$(git diff --name-only --diff-filter=ACM HEAD~1 HEAD 2>/dev/null || git diff --name-only --diff-filter=ACM --cached 2>/dev/null || git ls-files)
  DIFF_CMD="git diff HEAD~1 HEAD 2>/dev/null || git diff --cached"
else
  echo -e "${RED}Unknown mode: $MODE. Use 'staged' or 'ci'.${NC}"
  exit 1
fi

if [ -z "$FILES" ]; then
  echo -e "${GREEN}No files to check.${NC}"
  exit 0
fi

echo -e "${YELLOW}Checking for sensitive information...${NC}"

SENSITIVE_FILENAMES='\.env$|\.env\.|\.key$|\.pem$|\.p12$|\.pfx$|credentials\.json$|service-account.*\.json$'

for file in $FILES; do
  if echo "$file" | grep -qE "$SENSITIVE_FILENAMES"; then
    echo -e "${RED}BLOCKED: Sensitive file detected: $file${NC}"
    FAILED=1
  fi
done

SKIP_PATTERNS='\.lock$|package-lock\.json|bun\.lock|Cargo\.lock|\.svg$|\.png$|\.ico$|\.icns$|\.woff2?$|\.ttf$|\.eot$'

TEXT_FILES=""
for file in $FILES; do
  if ! echo "$file" | grep -qE "$SKIP_PATTERNS"; then
    TEXT_FILES="$TEXT_FILES $file"
  fi
done

if [ -n "$TEXT_FILES" ]; then
  CONTENT=$($DIFF_CMD -- $TEXT_FILES 2>/dev/null || true)

  if [ -n "$CONTENT" ]; then
    SECRET_PATTERNS=(
      'sk-[a-zA-Z0-9]{20,}'
      'sk-ant-[a-zA-Z0-9]{20,}'
      'ghp_[a-zA-Z0-9]{36}'
      'gho_[a-zA-Z0-9]{36}'
      'ghu_[a-zA-Z0-9]{36}'
      'ghs_[a-zA-Z0-9]{36}'
      'AKIA[0-9A-Z]{16}'
      'AIza[0-9A-Za-z\-_]{35}'
      '(?i)api[_-]?key\s*=\s*['\''"][^'\''"]{8,}['\''"]'
      '(?i)api[_-]?token\s*=\s*['\''"][^'\''"]{8,}['\''"]'
      '(?i)password\s*=\s*['\''"][^'\''"]{8,}['\''"]'
      '(?i)secret\s*=\s*['\''"][^'\''"]{8,}['\''"]'
      '(?i)private[_-]?key\s*=\s*['\''"][^'\''"]{8,}['\''"]'
      '(?i)-----BEGIN (RSA |EC |DSA )?PRIVATE KEY-----'
    )

    LABELS=(
      "OpenAI API Key"
      "Anthropic API Key"
      "GitHub Personal Access Token"
      "GitHub OAuth Token"
      "GitHub User Access Token"
      "GitHub Server Access Token"
      "AWS Access Key ID"
      "Google API Key"
      "Hardcoded API Key"
      "Hardcoded API Token"
      "Hardcoded Password"
      "Hardcoded Secret"
      "Hardcoded Private Key"
      "Private Key Block"
    )

    for i in "${!SECRET_PATTERNS[@]}"; do
      MATCH=$(echo "$CONTENT" | grep -Pn "${SECRET_PATTERNS[$i]}" 2>/dev/null || true)
      if [ -n "$MATCH" ]; then
        echo -e "${RED}BLOCKED: ${LABELS[$i]} detected:${NC}"
        echo "$MATCH" | head -5 | while IFS= read -r line; do
          echo -e "${RED}  $line${NC}"
        done
        FAILED=1
      fi
    done
  fi
fi

if [ "$FAILED" -eq 1 ]; then
  echo ""
  echo -e "${RED}Commit blocked: sensitive information detected.${NC}"
  echo -e "${YELLOW}If this is a false positive, use: git commit --no-verify${NC}"
  exit 1
else
  echo -e "${GREEN}No sensitive information detected. Safe to commit.${NC}"
  exit 0
fi
