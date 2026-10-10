# Frontend React de MassSend — build en dos etapas:
# 1) Node compila el proyecto con Vite
# 2) Nginx sirve los archivos estáticos y hace de proxy hacia Django
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
# Variables de compilación de Vite (opcionales):
#   VITE_ENABLE_AI=false  oculta el Asistente IA (despliegue liviano en AWS)
#   VITE_WS_URL           dirección pública del WebSocket del gateway
ARG VITE_ENABLE_AI=true
ARG VITE_WS_URL=ws://localhost:3001
ENV VITE_ENABLE_AI=$VITE_ENABLE_AI VITE_WS_URL=$VITE_WS_URL
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
