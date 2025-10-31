FROM ghcr.io/dojoengine/dojo:v1.7.1 AS dojo

RUN apt update && apt install -y curl jq && \
    curl -L https://slot.cartridge.sh | bash && \
    mv /root/.local/bin/slot /usr/local/bin/slot && \
    rm -rf /var/lib/apt/lists/*

FROM ghcr.io/dojoengine/katana:v1.7.1 AS katana

FROM ghcr.io/dojoengine/torii:v1.7.1 AS torii
