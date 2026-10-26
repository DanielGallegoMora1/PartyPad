# Imagen para desplegar en cualquier sitio que acepte Docker (Fly.io, Railway, Render…).
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
EXPOSE 3000
CMD ["node", "server/index.js"]
