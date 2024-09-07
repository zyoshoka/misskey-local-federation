FROM node:20

WORKDIR /workspace

COPY --link ["./package.json", "/workspace/package.json"]

RUN corepack enable && corepack prepare
