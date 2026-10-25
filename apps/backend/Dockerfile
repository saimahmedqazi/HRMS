# Stage 1: Build
FROM node:20-alpine AS builder

WORKDIR /app

# Install dependencies for canvas/native modules
RUN apk add --no-cache python3 make g++

COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/

RUN npm install

COPY apps/backend/prisma ./apps/backend/prisma/
RUN npx prisma generate --schema=./apps/backend/prisma/schema.prisma

COPY apps/backend ./apps/backend

RUN npm run build --workspace=apps/backend

# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

COPY package*.json ./
COPY apps/backend/package*.json ./apps/backend/

RUN npm install --omit=dev

COPY --from=builder /app/apps/backend/prisma ./apps/backend/prisma
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/apps/backend/dist ./apps/backend/dist

EXPOSE 4000

CMD ["node", "apps/backend/dist/main"]
