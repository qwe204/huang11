FROM node:20-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY src/ ./src/

RUN mkdir -p /data/documents /data/db

EXPOSE 3000

CMD ["node", "src/app.js"]
