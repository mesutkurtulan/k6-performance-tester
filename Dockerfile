FROM grafana/k6:0.54.0 AS k6
FROM node:20-bookworm-slim

COPY --from=k6 /usr/bin/k6 /usr/bin/k6
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev
COPY dist ./dist
COPY prompts ./prompts
COPY templates ./templates
COPY config ./config
COPY examples ./examples

ENTRYPOINT ["node", "dist/cli/index.js"]
