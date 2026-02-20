RPC := https://starknet-sepolia.g.alchemy.com/starknet/version/rpc/v0_7/BH94rz8FKjKLFcF5SdysiJDQ4z0h2Y7B
SIGNER := starkli-signer
ACCOUNT := starkli-account
SIGNER_PUB_KEY := 0x05ef381d8962b25a357d8d4a308076123ffb65edcd31d75f5e85794a339c42a6

llms-gen:
	npx -y llmstxt@latest gen https://docs.openzeppelin.com/sitemap-contracts-cairo.xml \
	 -t 'OpenZeppelin Contracts 0.20.0' \
	 -d 'OpenZeppelin Contracts written in Cairo for Starknet, a decentralized ZK Rollup' > llms.txt

signer-init:
	starkli signer keystore new $(SIGNER)

account-init:
	starknet account oz init $(ACCOUNT) --keystore $(SIGNER)

account-deploy:
	starkli account deploy $(ACCOUNT) --rpc $(RPC) --keystore $(SIGNER)

declare:
	starkli declare $(ARTIFACT) --rpc $(RPC) --account $(ACCOUNT) --keystore $(SIGNER)


# Old commands

update-cairo:
	pip3 install cairo-lang==0.10.0

compile: update-requirements
	starknet-compile --account_contract src/openzeppelin/account/presets/Account.cairo --cairo_path=src --output=./artifacts/Account.json

deprecated-compile: update-requirements
	starknet-compile-deprecated --account_contract src/openzeppelin/account/presets/Account.cairo --cairo_path=src --output=./artifacts/Account.json

update-requirements: update-cairo
	pip install -r requirements.txt

update-pydantic:
	pip install pydantic==1.9

class-hash: compile
	python3 tmp.py