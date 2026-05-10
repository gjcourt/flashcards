# syntax=docker/dockerfile:1.7

# ── Build stage ────────────────────────────────────────────────────────────
# Two builds in one stage:
#   /app/dist       — multi-deck (default base /, no lock)
#   /app/dist-nato  — NATO-locked focused build (base /nato/)
# Both are baked into the runtime image so a single nginx pod serves both
# at /  and  /nato/.
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Multi-deck build at the root.
RUN BASE_PATH=/ npm run build && mv dist dist-multi

# NATO-locked focused build under /nato/.
RUN BASE_PATH=/nato/ VITE_LOCKED_DECK=nato npm run build && mv dist dist-nato

# ── Runtime stage ──────────────────────────────────────────────────────────
FROM nginxinc/nginx-unprivileged:1.27-alpine

# nginx-unprivileged runs as uid 101 by default; nothing to chown.
COPY --from=build /app/dist-multi /usr/share/nginx/html
COPY --from=build /app/dist-nato /usr/share/nginx/html/nato
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 8080

# Health endpoint at /healthz — see nginx.conf.
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://localhost:8080/healthz || exit 1
