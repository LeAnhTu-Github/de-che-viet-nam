FROM node:20-alpine
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@latest --activate
COPY pnpm-workspace.yaml package.json ./
COPY packages ./packages
COPY apps/server ./apps/server
RUN pnpm install --filter @aoe-vn/server...
RUN pnpm --filter @aoe-vn/server build
EXPOSE 2567
CMD ["node", "apps/server/dist/index.js"]
