const {typedData, shortString} = require("starknet");

const types = {
  StarknetDomain: [
    { name: "name", type: "shortstring" },
    { name: "version", type: "shortstring" },
    { name: "chainId", type: "shortstring" },
    { name: "revision", type: "shortstring" },
  ],
  Vote: [
    { name: "verifying_contract", type: "ContractAddress" },
    { name: "nonce", type: "felt" },
    { name: "proposal_id", type: "felt" },
    { name: "support", type: "u128" },
    { name: "voter", type: "ContractAddress" },
  ],
  VoteWithReasonAndParams: [
    { name: "verifying_contract", type: "ContractAddress" },
    { name: "nonce", type: "felt" },
    { name: "proposal_id", type: "felt" },
    { name: "support", type: "u128" },
    { name: "voter", type: "ContractAddress" },
    { name: "reason_hash", type: "felt" },
    { name: "params", type: "felt*" },
  ],
};

function getDomain(chainId) {
  return {
    name: "DAPP_NAME",
    version: "DAPP_VERSION",
    chainId,
    revision: "1",
  };
}

function getTypedDataHash(myStruct, chainId, owner) {
  return typedData.getMessageHash(getTypedData(myStruct, chainId), owner);
}

function getTypedData(myStruct, chainId) {
  return {
    types,
    primaryType: "VoteWithReasonAndParams",
    domain: getDomain(chainId),
    message: { ...myStruct },
  };
}

const vote = {
  verifying_contract: shortString.encodeShortString("VERIFIER"),
  nonce: 0,
  proposal_id: 1,
  support: 1,
  voter: shortString.encodeShortString("VOTER"),
};

const voteWithReasonAndParams = {
  ...vote,
  reason_hash: shortString.encodeShortString("hash"),
  params: [shortString.encodeShortString("param"), 1],
};

console.log(`STARKNET_DOMAIN_TYPE_HASH = ${typedData.getTypeHash(types, "StarknetDomain", "1")};`);
console.log(`Vote_TYPE_HASH = ${typedData.getTypeHash(types, "VoteWithReasonAndParams", "1")};`);
console.log(`struct_hash = ${typedData.getStructHash(types, "VoteWithReasonAndParams", voteWithReasonAndParams, "1")};`);
console.log(`message_hash = ${getTypedDataHash(voteWithReasonAndParams, "SN_TEST", shortString.encodeShortString("VOTER"))};`);


// 0x4b1323f34e16e96b211f9a59f6601d6810b9ea409180e9167d8fdd7b6d58182