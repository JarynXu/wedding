FROM node:22-alpine AS build

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:22-alpine

WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist
COPY server ./server
COPY src/config.js src/share-metadata.js src/share-html.js src/family-invitation.js src/invitation-theme.js ./src/
USER node

EXPOSE 8080

CMD ["node", "server/index.js"]
