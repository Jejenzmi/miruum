# Miruum web portal — Node/Express/EJS (landing + Back Office + Extranet).
FROM node:22-bookworm-slim
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV NODE_ENV=production
EXPOSE 4101
CMD ["node", "src/server.js"]
