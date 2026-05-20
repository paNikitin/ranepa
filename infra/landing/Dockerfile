# Минимальный nginx-образ для лендинга.
#   docker build -t harbor.parsers360.ru:10443/ranepa/landing:0.1.0 -f infra/landing/Dockerfile infra/landing
#   docker push harbor.parsers360.ru:10443/ranepa/landing:0.1.0

FROM nginx:1.27-alpine
COPY index.html style.css /usr/share/nginx/html/
EXPOSE 80
