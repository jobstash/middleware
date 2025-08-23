# ---- build ----
FROM node:22-alpine AS build
WORKDIR /usr/src/app
RUN apk add --no-cache python3 make g++ git libc6-compat
ENV PYTHON=/usr/bin/python3
ENV npm_config_python=/usr/bin/python3
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile
COPY . .
RUN yarn build

# ---- runtime ----
FROM node:22-alpine
WORKDIR /usr/src/app
# only runtime deps
COPY package.json yarn.lock ./
RUN yarn install --frozen-lockfile --production
COPY --from=build /usr/src/app/dist ./dist
# copy anything your app needs at runtime (configs, public assets, etc.)
CMD ["yarn", "start:prod"]