#!/bin/bash
set -euo pipefail
exec "$(cd "$(dirname "$0")" && pwd)/build-ios-ipa.sh" "$@"
