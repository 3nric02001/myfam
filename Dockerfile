# Build stage
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# Native modules ship prebuilt binaries, so no install scripts (and no compiler) are needed.
RUN npm ci --ignore-scripts
COPY . .
RUN npm run build && npm prune --omit=dev

# Runtime stage
FROM node:22-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=/data/myfam.db
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/drizzle ./drizzle
COPY package.json ./
RUN mkdir -p /data && chown node:node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node", "build"]
