#!/usr/bin/env bash
# KubeNinja setup for macOS / Linux — installs prerequisites, skipping anything present.
# Run:  ./install.sh   (or:  bash install.sh)
#
# Steps: check Node.js 20+  ->  npm install  ->  fetch the bundled Helm binaries.
set -euo pipefail
cd "$(dirname "$0")"

c_reset='\033[0m'; c_gray='\033[90m'; c_green='\033[32m'; c_cyan='\033[36m'; c_yellow='\033[33m'
info()  { printf "  %s\n" "$1"; }
ok()    { printf "${c_green}OK${c_reset}  %s\n" "$1"; }
step()  { printf "\n${c_cyan}== %s ==${c_reset}\n" "$1"; }
warn()  { printf "${c_yellow}!!${c_reset}  %s\n" "$1"; }
have()  { command -v "$1" >/dev/null 2>&1; }

printf "KubeNinja setup\n"
[ -f package.json ] || { warn "Run this from the KubeNinja folder (no package.json here)."; exit 1; }

os="$(uname -s)"

# 1. Node.js 20+
step "Node.js (>= 20)"
need_node=1
if have node; then
  ver="$(node -v | sed 's/^v//')"
  major="${ver%%.*}"
  if [ "$major" -ge 20 ] 2>/dev/null; then ok "Node $ver already installed"; need_node=0
  else warn "Node $ver is older than 20 — please upgrade"; fi
else
  info "Node.js not found"
fi

if [ "$need_node" -eq 1 ]; then
  echo
  warn "Node.js 20+ is required. Install it, then re-run ./install.sh:"
  if [ "$os" = "Darwin" ]; then
    if have brew; then info "brew install node        # Homebrew detected"
    else info "Install Homebrew (https://brew.sh) then: brew install node"; fi
    info "or download the macOS installer from https://nodejs.org"
  else
    if have apt-get; then info "Debian/Ubuntu: curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash - && sudo apt-get install -y nodejs"
    elif have dnf; then info "Fedora/RHEL:   sudo dnf module install nodejs:20"
    elif have pacman; then info "Arch:          sudo pacman -S nodejs npm"
    else info "Install Node.js 20+ from https://nodejs.org or your package manager"; fi
  fi
  exit 1
fi

# 2. npm dependencies
step "npm dependencies"
info "Running npm install (this can take a couple of minutes)..."
npm install
ok "Dependencies installed"

# 3. Bundled Helm binaries (for the Helm view)
step "Helm binaries"
if [ -f resources/bin/helm-linux-x64 ] || [ -f resources/bin/helm-darwin-arm64 ] || [ -f resources/bin/helm-darwin-x64 ]; then
  ok "Helm binaries already present"
else
  if node scripts/fetch-helm.mjs; then
    chmod +x resources/bin/helm-linux-* resources/bin/helm-darwin-* 2>/dev/null || true
    ok "Helm binaries fetched"
  else
    warn "Could not fetch Helm (needs curl + tar/unzip). Helm actions will be disabled; the rest works."
  fi
fi

# Done
printf "\n${c_green}Setup complete.${c_reset}\n"
printf "Next:\n"
printf "  ${c_cyan}npm run dev${c_reset}    ${c_gray}# launch with hot reload${c_reset}\n"
printf "  ${c_cyan}npm run dist${c_reset}   ${c_gray}# build an installer for this OS -> dist/${c_reset}\n"
