FROM node:16-alpine AS runtime
WORKDIR /app

FROM runtime AS dev

RUN \
    apk add --no-cache bash

FROM runtime AS prod

COPY . /app

CMD ["node", "/app/dist/server.js"]
