# ---------- build (toolchain + Yarn v1 pinned) ----------
FROM node:22-alpine3.22 AS build
WORKDIR /usr/src/app

# Toolchain for native deps (bufferutil, etc.)
RUN apk add --no-cache python3 make g++ git libc6-compat
ENV PYTHON=/usr/bin/python3
ENV npm_config_python=/usr/bin/python3

# Use Corepack, but PIN Yarn Classic explicitly to avoid Yarn 4
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# 1) Install (with dev) to build
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# 2) Build
COPY . .
RUN yarn build

# 3) Reinstall prod-only deps (still in build stage with toolchain)
RUN rm -rf node_modules && yarn install --frozen-lockfile --production

# ---------- runtime (no compilers, no installs, no yarn) ----------
FROM node:22-alpine3.22 AS runtime
WORKDIR /usr/src/app

# Only copy what you need to run
COPY --from=build /usr/src/app/package.json ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

# Avoid yarn entirely at runtime to dodge shims/collisions
CMD ["node", "dist/main.js"]