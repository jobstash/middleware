# ---------- build (toolchain + classic Yarn) ----------
FROM node:22-alpine3.22 AS build
WORKDIR /usr/src/app

# Toolchain for native modules (bufferutil, etc.)
RUN apk add --no-cache python3 make g++ git libc6-compat
ENV PYTHON=/usr/bin/python3
ENV npm_config_python=/usr/bin/python3

# Pin Yarn Classic to avoid Corepack auto-upgrades to Yarn 4
RUN npm i -g yarn@1.22.22

# 1) Install deps (with dev) to build
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# 2) Build
COPY . .
RUN yarn build

# 3) Prune to production deps (clean re-install)
RUN rm -rf node_modules \
    && yarn install --frozen-lockfile --production

# ---------- runtime (no compilers, no installs) ----------
FROM node:22-alpine3.22 AS runtime
WORKDIR /usr/src/app

# Only to run scripts; we won't install here
RUN npm i -g yarn@1.22.22

# Bring only what you need at runtime
COPY --from=build /usr/src/app/package.json ./
COPY --from=build /usr/src/app/yarn.lock ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist

CMD ["yarn", "start:prod"]