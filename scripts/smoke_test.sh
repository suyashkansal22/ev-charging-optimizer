#!/usr/bin/env bash
# Quick check after `docker compose up`
set -e
curl -s localhost:8000/health
echo
curl -s -X POST localhost:8000/optimize | head -c 400
echo
