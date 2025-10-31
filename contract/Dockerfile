# 1) Build stage: start from dojo and install slot
FROM ghcr.io/dojoengine/dojo:v1.7.1 AS slot-install

# install curl/jq and slotup, then install slot with slotup
RUN apt-get update && \
    apt-get install -y curl jq ca-certificates && \
    curl -L https://slot.cartridge.sh | bash && \
    # slotup is now in /root/.slot/bin
    /root/.slot/bin/slotup && \
    # optional: make binaries reachable in this stage
    ln -s /root/.slot/bin/slotup /usr/local/bin/slotup && \
    ln -s /root/.slot/bin/slot /usr/local/bin/slot && \
    rm -rf /var/lib/apt/lists/*

# 2) (optional) keep katana image around if you still want it as a stage
FROM ghcr.io/dojoengine/katana:v1.7.1 AS katana
# nothing special here

# 3) Final image: torii + slot from the first stage
FROM ghcr.io/dojoengine/torii:v1.7.1

# copy the installed slot toolchain from the dojo stage
COPY --from=slot-install /root/.slot /root/.slot

# make slot/slotup available everywhere
ENV PATH="/root/.slot/bin:${PATH}"

# (optional) show what we have
RUN slot --version && slotup --version
