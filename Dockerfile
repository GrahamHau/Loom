FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build
RUN cd landing && npm ci && npm run build

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/landing/dist ./landing/dist
COPY server ./server
COPY scripts ./scripts
COPY src/legacy/data.js ./src/legacy/data.js
EXPOSE 3000
CMD ["node", "server/index.js"]
