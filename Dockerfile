# ---------- build (has toolchain) ----------
FROM node:22-alpine3.22 AS build
WORKDIR /usr/src/app

# Toolchain so native deps (bufferutil, etc.) can compile
RUN apk add --no-cache python3 make g++ git libc6-compat
ENV PYTHON=/usr/bin/python3
ENV npm_config_python=/usr/bin/python3

# Ensure Yarn v1 on Node 22
RUN corepack enable && corepack prepare yarn --activate

# 1) Install with dev deps to build
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile

# 2) Build your app
COPY . .
RUN yarn build

# 3) Prune to production (removes dev deps)
#    If you use workspaces, swap this for:
#    RUN yarn workspaces focus --all --production
RUN yarn install --frozen-lockfile --production

# ---------- runtime (no compilers, no install) ----------
FROM node:22-alpine3.22 AS runtime
WORKDIR /usr/src/app

# Yarn just to run scripts; no installs happen here
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

# Copy only what you need at runtime
COPY --from=build /usr/src/app/package.json ./
COPY --from=build /usr/src/app/yarn.lock ./
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/dist ./dist
# copy other runtime assets if you have them:
# COPY --from=build /usr/src/app/prisma ./prisma
# COPY --from=build /usr/src/app/public ./public

CMD ["yarn", "start:prod"]