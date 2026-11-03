# Local copy of the "Validate tweaks" CI environment (developer use only).
# Build and run it through tools/test-in-container.sh, not directly.

# ubuntu target: the GitHub runner (ubuntu-latest) used by the contract and
# launcher jobs: Python 3.12, Node.js 22, ShellCheck, Lua 5.1, static BusyBox.
FROM ubuntu:24.04 AS ubuntu
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq \
 && apt-get install -y --no-install-recommends \
      python3 python-is-python3 python3-yaml shellcheck lua5.1 busybox-static \
      patch zip unzip file git xxd ca-certificates curl xz-utils \
 && rm -rf /var/lib/apt/lists/*
ARG NODE_VERSION=22.12.0
RUN arch=$(dpkg --print-architecture) \
 && case "$arch" in amd64) n=x64 ;; arm64) n=arm64 ;; *) echo "unsupported $arch" >&2; exit 1 ;; esac \
 && curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${n}.tar.xz" \
    | tar -xJ -C /usr/local --strip-components=1 --exclude='*/include' --exclude='*/share' \
 && node --version && busybox patch --help >/dev/null 2>&1
ENV HOME=/tmp PYTHONDONTWRITEBYTECODE=1
