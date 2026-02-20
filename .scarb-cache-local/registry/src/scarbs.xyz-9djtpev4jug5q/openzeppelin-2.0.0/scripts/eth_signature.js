// Tested with ethers v6.9.0
const { ethers } = require("ethers");

const private_key = "0x45397ee6ca34cb49060f1c303c6cb7ee2d6123e617601ef3e31ccf7bf5bef1f9";
const message = "0x077ab2f889d044a0a23f30c86151d7b5c6d2adc91fb603b16bb32fd35d3ac07d";

signing_key = new ethers.SigningKey(private_key);
signature = signing_key.sign(message)

console.log(`private_key = ${private_key}`);
console.log(`public_key = ${signing_key.publicKey}`);
console.log(`message = ${message}`);
console.log(signature);
