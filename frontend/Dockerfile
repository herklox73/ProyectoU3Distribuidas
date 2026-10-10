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
#   VITE_ENABLE_CREDITS=false  oculta la página de Créditos/pagos
#   VITE_ENABLE_GOOGLE=false   oculta el botón "Continuar con Google"
#   VITE_ENABLE_EMAIL=false    oculta Notificaciones, Cola de correos, registro y recuperación
#   VITE_WS_URL           dirección pública del WebSocket del gateway
ARG VITE_ENABLE_AI=true
ARG VITE_ENABLE_CREDITS=true
ARG VITE_ENABLE_GOOGLE=true
ARG VITE_ENABLE_EMAIL=true
ARG VITE_WS_URL=ws://localhost:3001
ENV VITE_ENABLE_AI=$VITE_ENABLE_AI VITE_ENABLE_CREDITS=$VITE_ENABLE_CREDITS VITE_ENABLE_GOOGLE=$VITE_ENABLE_GOOGLE VITE_ENABLE_EMAIL=$VITE_ENABLE_EMAIL VITE_WS_URL=$VITE_WS_URL
RUN npm run build

FROM nginx:alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
