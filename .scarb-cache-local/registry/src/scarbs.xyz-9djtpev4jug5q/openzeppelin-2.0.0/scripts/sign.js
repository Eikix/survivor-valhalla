const {ec, encode} = require("starknet");

const privateKey = "1234";
const starknetPublicKey = ec.starkCurve.getStarkKey(privateKey);
const fullPublicKey = encode.addHexPrefix( encode.buf2hex( ec.starkCurve.getPublicKey( privateKey, false)));

const msgHash = "0x314bd38b22b62d576691d8dafd9f8ea0601329ebe686bc64ca28e4d8821d5a0";
const signature = ec.starkCurve.sign(msgHash, privateKey);

console.log(`privateKey = ${privateKey}`);
console.log(`publicKey = ${starknetPublicKey}`);
console.log(`fullPublicKey = ${fullPublicKey}`);
console.log(`msgHash = ${msgHash}`);
console.log(`signature = 0x${signature.r.toString(16)} 0x${signature.s.toString(16)}`);
