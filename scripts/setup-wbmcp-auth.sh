#!/usr/bin/env bash
# Interactive Meta WhatsApp Business credential setup for WBMCP.
# Docs: https://github.com/saravanaspar/WBMCP
# Meta: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
set -euo pipefail
exec /opt/homebrew/bin/npx -y wbmcp@latest auth
