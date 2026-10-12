#!/usr/bin/env bash
# Installs Docker Engine in rootless mode inside a WSL Ubuntu distro (or any Ubuntu).
# Rootless: the Docker daemon runs as your normal user, so a container escape gets your user's
# rights inside WSL, not root's.
#
#   bash scripts/setup-docker-wsl.sh --check          read-only: report what's there and what's missing
#   bash scripts/setup-docker-wsl.sh --compose-only   keep an existing distro docker.io (root daemon) and
#                                                     only add the Compose and Buildx plugins
#   bash scripts/setup-docker-wsl.sh                  full rootless install (asks for your sudo password)
#
# From Windows:  wsl -d Ubuntu -- bash scripts/setup-docker-wsl.sh --check
set -euo pipefail

# Docker's official apt signing key fingerprint (https://docs.docker.com/engine/install/ubuntu/).
DOCKER_KEY_FPR="9DC858229FC7DD38854AE2D88D81803C0EBFCD88"

check() {
  echo "distro:        $(. /etc/os-release && echo "$PRETTY_NAME ($VERSION_CODENAME)")"
  echo "user:          $(id -un) (uid $(id -u))"
  echo "init (PID 1):  $(ps -p 1 -o comm=)"
  echo "cpus / memory: $(nproc) / $(free -g | awk '/Mem:/ {print $2 " GiB"}')"
  if command -v docker >/dev/null; then
    echo "docker:        $(docker --version)"
    echo "context:       $(docker context show 2>/dev/null || echo '?')"
    docker info --format 'security:      {{.SecurityOptions}}' 2>/dev/null || echo "daemon:        not reachable"
  else
    echo "docker:        not installed"
  fi
  echo "subuid range:  $(grep "^$(id -un):" /etc/subuid 2>/dev/null || echo 'none (needed for rootless)')"
  echo "docker group:  $(id -nG | tr ' ' '\n' | grep -qx docker && echo "yes (root-equivalent access to the root daemon)" || echo no)"
  echo "packages:      $(dpkg-query -W -f='${Package} ${Version}, ' docker.io docker-ce docker-compose-v2 docker-compose-plugin docker-buildx docker-buildx-plugin rootlesskit docker-ce-rootless-extras 2>/dev/null)"
  echo "compose:       $(docker compose version 2>/dev/null || echo missing)"
  echo "buildx:        $(docker buildx version 2>/dev/null || echo missing)"
  echo "rootless tool: $(command -v dockerd-rootless-setuptool.sh || ls /usr/share/docker.io/contrib/dockerd-rootless-setuptool.sh 2>/dev/null || echo missing)"
  echo "root daemon:   $(systemctl is-active docker.service 2>/dev/null) / enabled: $(systemctl is-enabled docker.service 2>/dev/null)"
  echo "containers:    $(docker ps -aq 2>/dev/null | wc -l) total, $(docker ps -q 2>/dev/null | wc -l) running; images: $(docker images -q 2>/dev/null | wc -l)"
  if [ "$(ps -p 1 -o comm=)" != "systemd" ]; then
    cat <<'EOF'

systemd is not running; rootless Docker needs it. Enable it once:
  sudo sh -c 'printf "[boot]\nsystemd=true\n" >> /etc/wsl.conf'
then from Windows:  wsl --shutdown   and open Ubuntu again.
EOF
  fi
}

install() {
  [ "$(ps -p 1 -o comm=)" = "systemd" ] || { check; exit 1; }

  echo "== remove distro Docker packages that conflict with Docker's official ones"
  # (https://docs.docker.com/engine/install/ubuntu/#uninstall-old-versions) Images/containers of
  # the old root daemon in /var/lib/docker are left untouched.
  for pkg in docker.io docker-doc docker-compose docker-compose-v2 docker-buildx podman-docker containerd runc; do
    if dpkg -s "$pkg" >/dev/null 2>&1; then sudo apt-get -o DPkg::Lock::Timeout=300 remove -y "$pkg"; fi
  done

  echo "== apt prerequisites"
  sudo apt-get -o DPkg::Lock::Timeout=300 update
  sudo apt-get -o DPkg::Lock::Timeout=300 install -y ca-certificates curl gnupg uidmap dbus-user-session

  echo "== Docker apt repository (key fingerprint verified)"
  sudo install -m 0755 -d /etc/apt/keyrings
  tmpkey=$(mktemp)
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o "$tmpkey"
  fpr=$(gpg --show-keys --with-colons "$tmpkey" | awk -F: '/^fpr/ {print $10; exit}')
  if [ "$fpr" != "$DOCKER_KEY_FPR" ]; then
    echo "Docker signing key fingerprint mismatch: got $fpr" >&2; exit 1
  fi
  sudo install -m 0644 "$tmpkey" /etc/apt/keyrings/docker.asc
  rm -f "$tmpkey"
  codename=$(. /etc/os-release && echo "$VERSION_CODENAME")
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $codename stable" \
    | sudo tee /etc/apt/sources.list.d/docker.list >/dev/null

  echo "== Docker Engine, Buildx, Compose, rootless extras"
  sudo apt-get -o DPkg::Lock::Timeout=300 update
  sudo apt-get -o DPkg::Lock::Timeout=300 install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin \
    docker-compose-plugin docker-ce-rootless-extras

  echo "== disable the root daemon; only the rootless one will run"
  sudo systemctl disable --now docker.service docker.socket
  sudo rm -f /var/run/docker.sock
  # Membership of the docker group is root-equivalent; it's not needed for rootless Docker.
  if id -nG | tr ' ' '\n' | grep -qx docker; then sudo gpasswd -d "$(id -un)" docker; fi

  echo "== rootless daemon for $(id -un)"
  dockerd-rootless-setuptool.sh install
  systemctl --user enable --now docker
  # Keep the user's daemon running without an open login session.
  sudo loginctl enable-linger "$(id -un)"

  echo "== done"
  docker context use rootless >/dev/null 2>&1 || true
  check
}

compose_only() {
  command -v docker >/dev/null || { echo "docker is not installed; run without --compose-only" >&2; exit 1; }
  sudo apt-get -o DPkg::Lock::Timeout=300 update
  sudo apt-get -o DPkg::Lock::Timeout=300 install -y docker-compose-v2 docker-buildx
  check
}

case "${1:-}" in
  --check) check ;;
  --compose-only) compose_only ;;
  "") install ;;
  *) echo "usage: $0 [--check | --compose-only]" >&2; exit 2 ;;
esac
