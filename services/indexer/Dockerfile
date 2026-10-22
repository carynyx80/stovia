FROM node:22-bookworm-slim
WORKDIR /app
RUN corepack enable
COPY . .
RUN pnpm install --frozen-lockfile --ignore-scripts && pnpm db:generate
CMD ["pnpm", "--filter", "@stovia/indexer", "start"]
