# 1) Build stage: start from dojo and install slot
FROM ghcr.io/dojoengine/dojo:v1.7.1 AS slot-install

RUN apt-get update && \
    apt-get install -y curl jq ca-certificates && \
    curl -L https://slot.cartridge.sh | bash && \
    /root/.slot/bin/slotup && \
    rm -rf /var/lib/apt/lists/*

# 2) Final image: torii + slot from build stage
FROM ghcr.io/dojoengine/torii:v1.7.1

# bring slot runtime in
COPY --from=slot-install /root/.slot /root/.slot

# make it available
ENV PATH="/root/.slot/bin:${PATH}"

# optional: ONLY check slot (this one works)
RUN slot --version
