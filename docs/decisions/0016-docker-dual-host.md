# 0016 — One Docker Compose stack, home first, Oracle as off-site standby
Date: 2026-10-04 · Status: accepted (exact roles depend on which Jetson we have)

**Context:** We want to self-host for free on hardware we own (Raspberry Pi 5, NVIDIA Jetson) or on Oracle Always Free. Oracle cut its Always Free A1 allowance to 2 OCPU / 12 GB in June 2026 without announcing it. Our domain is on Cloudflare.
**Decision:** The app is served with **docker compose** and runs unchanged on any of the hosts; only `.env` and the `compose.jetson.yaml` / `compose.oracle.yaml` overrides differ. All hosts are ARM64, so we build `linux/arm64` images on free GitHub arm runners → GHCR. Proposed roles: **Pi 5 = app host** (Caddy, FastAPI, worker, Postgres, cloudflared), **Jetson Orin Nano = GPU inference node**, **Oracle = encrypted off-site backup + cold standby**. Public access through **Cloudflare Tunnel** on our domain (no open ports). If the Jetson is the original Nano (no usable GPU for LLMs), the Pi runs everything with CPU inference.
**Alternatives:** Oracle as primary (rejected: free terms changed in 2026, data off-site); a paid VPS (rejected: zero cost); everything on the Jetson (possible, but leaves less memory for the model).
**Consequences:** Data lives at home. A home outage takes the app down until we fail over to Oracle (DNS/tunnel switch). Backups must be tested.
