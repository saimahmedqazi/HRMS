# Stage 1: Dependencies & Build
FROM node:20-alpine AS builder

WORKDIR /app

COPY package*.json ./
COPY apps/frontend/package*.json ./apps/frontend/

RUN npm install

COPY apps/frontend ./apps/frontend

ENV NEXT_TELEMETRY_DISABLED=1
ENV NODE_ENV=production

RUN npm run build --workspace=apps/frontend

# Stage 2: Production Runner
FROM node:20-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY --from=builder /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/apps/frontend/package.json ./apps/frontend/package.json

EXPOSE 3000

ENV PORT=3000
ENV HOSTNAME="0.0.0.0"

CMD ["npm", "run", "start", "--workspace=apps/frontend"]
