FROM node:22-alpine

WORKDIR /app

# install production deps first for layer caching
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

COPY server ./server
COPY public ./public

# private class media / customer docs live here (mounted as a volume)
RUN mkdir -p media public/uploads

ENV NODE_ENV=production
EXPOSE 3000

# bootstrap = idempotent schema init + first admin account, then start
CMD ["sh", "-c", "node server/bootstrap.js && node server/server.js"]
