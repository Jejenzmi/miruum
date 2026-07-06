# Miruum backend — Debian slim (openssl for Prisma). Compiles TS → dist, seeds, serves.
FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npx prisma generate && npm run build

ENV NODE_ENV=production
EXPOSE 5013
# Apply schema, seed (idempotent upserts), then start.
CMD ["sh", "-c", "npx prisma db push --skip-generate && node dist/seed.js && node dist/server.js"]
