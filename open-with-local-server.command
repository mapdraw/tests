#!/bin/bash

# Usage: Double-click to serve this folder on http://localhost:8000
# Make executable: chmod +x path/to/open-with-local-server.command

# Serve this folder
cd "$(dirname "$0")" || exit 1

# Open browser
(sleep 1; open "http://localhost:8000") &

# Start server
python3 -m http.server --cgi 8000
