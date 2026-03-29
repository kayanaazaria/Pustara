FROM node:18

WORKDIR /app

ENV NODE_ENV=neon
ENV NEON_CLOUD_MODE=true

# Copy ALL package files and install
COPY backend/package.json ./
COPY backend/package-lock.json ./

# Install all dependencies (including dev)
RUN npm ci --production=false || npm install

# Copy entire backend code
COPY backend/ ./

# List what we have (debugging)
RUN echo "=== Node Modules ===" && ls -la node_modules/ | head -20 && echo "=== App Files ===" && ls -la

EXPOSE 3000

CMD ["npm", "start"]