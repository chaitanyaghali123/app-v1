FROM node:18-alpine AS builder

WORKDIR /app

ARG VITE_BACKEND_URL
ENV VITE_BACKEND_URL=$VITE_BACKEND_URL

COPY package.json package-lock.json ./
RUN npm install
COPY . .

RUN npm run build

FROM node:18-alpine
WORKDIR /app

RUN npm install -g serve

COPY --from=builder /app/dist ./dist

EXPOSE 4173
CMD ["serve", "-s", "dist", "-l", "4173"]
