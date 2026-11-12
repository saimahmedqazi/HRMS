# Stage 1: Build
FROM node:24-alpine AS builder

WORKDIR /app

# Install OpenSSL for Prisma and the toolchain for native modules.
RUN apk add --no-cache openssl python3 make g++

COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

RUN npm ci

COPY apps/backend/prisma ./apps/backend/prisma/
RUN npx prisma generate --schema=./apps/backend/prisma/schema.prisma

COPY apps/backend ./apps/backend

RUN npm run build --workspace=apps/backend

# Stage 2: Production Runner
FROM node:24-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

RUN apk add --no-cache openssl

COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/

RUN npm ci --omit=dev

COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

EXPOSE 4000

CMD ["node", "apps/backend/dist/src/main.js"]
