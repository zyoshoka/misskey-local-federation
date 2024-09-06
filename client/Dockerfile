FROM node:20

WORKDIR /client

COPY --link ["./package.json", "/client/package.json"]

RUN corepack enable && corepack prepare
