FROM node:22-alpine
WORKDIR /app
# fonts so sharp can rasterise SVG text (placeholder images)
RUN apk add --no-cache fontconfig ttf-dejavu
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY src ./src
ENV NODE_ENV=production
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
