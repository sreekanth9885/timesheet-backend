
const fs = require("fs");
const crypto = require("crypto");

const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: {
    type: "spki",
    format: "der",
  },
  privateKeyEncoding: {
    type: "pkcs8",
    format: "pem",
  },
});

fs.writeFileSync(
  "postman-public-key.txt",
  publicKey.toString("base64")
);

fs.writeFileSync("postman-private-key.pem", privateKey);

console.log("Public key saved to postman-public-key.txt");
console.log("Private key saved to postman-private-key.pem");
