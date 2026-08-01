# Frontend React de MassSend — build en dos etapas:
# 1) Node compila el proyecto con Vite
# 2) Nginx sirve los archivos estáticos y hace de proxy hacia Django
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
