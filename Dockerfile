FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY index.html /usr/share/nginx/html/
COPY src/ /usr/share/nginx/html/src/
COPY sounds/ /usr/share/nginx/html/sounds/
