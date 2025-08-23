FROM node:22-alpine

WORKDIR /usr/src/app

# Toolchain + glibc compat so node-gyp can compile native modules on alpine/arm64
RUN apk add --no-cache python3 make g++ git libc6-compat \
    && npm config set python /usr/bin/python3

COPY package.json yarn.lock ./
# Keep lockfile strict for reproducibility
RUN yarn install --frozen-lockfile

COPY . .
RUN yarn build

CMD ["yarn", "start:prod"]