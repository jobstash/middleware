# ---------- build ----------
FROM node:22-alpine3.22 AS build
WORKDIR /usr/src/app

# Yarn v1
RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY package.json yarn.lock ./
# Skip optional native modules like bufferutil/utf-8-validate
RUN yarn install --frozen-lockfile --ignore-optional

COPY . .
RUN yarn build

# ---------- runtime ----------
FROM node:22-alpine3.22
WORKDIR /usr/src/app

RUN corepack enable && corepack prepare yarn@1.22.22 --activate

COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production --ignore-optional

COPY --from=build /usr/src/app/dist ./dist

CMD ["yarn", "start:prod"]