# 1. Dependencias
FROM node:20-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

# 2. Construcción (Si usas TypeScript, aquí se compila)
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Si usas NestJS o TS, descomenta la siguiente línea:
# RUN npm run build 

# 3. Producción
FROM node:20-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production

# Usuario de seguridad
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nodeapp
USER nodeapp

COPY --from=builder /app ./

# El puerto estándar para contenedores en Azure
EXPOSE 8080
ENV PORT=8080

# Ajusta el comando según cómo inicies tu app (ej: node dist/main.js o node server.js)
CMD ["node", "src/index.js"]