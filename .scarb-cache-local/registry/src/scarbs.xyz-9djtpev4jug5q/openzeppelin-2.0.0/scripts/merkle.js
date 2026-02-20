const {merkle} = require("starknet");

const leaves = ['0x1', '0x2', '0x3', '0x4', '0x5', '0x6', '0x7'];
const tree = new merkle.MerkleTree(leaves);

console.log(`root = ${tree.root}\n`);

console.log(`proof = ${tree.getProof('0x3')}\n`);

for (let i = 0; i < tree.branches.length; i++) {
  console.log(`branch ${i} = ${tree.branches[i]};`);
}

a = merkle.MerkleTree.hash('0x7', '0x0', tree.hashMethod);
console.log(`hash('0x7', '0x0') = ${a}`);