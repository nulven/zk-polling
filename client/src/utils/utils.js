const { eddsa, babyJub } = require('circomlib');
const { prv2pub, sign } = eddsa;
const { packPoint } = babyJub;
const bigInt = require('big-integer');
const { BigInteger } = require('big-integer');


export function generateKey() {
  const privateKey = Math.floor(Math.random()*1000000);
  const publicKey = prv2pub(privateKey.toString());
  return { publicKey: publicKey, privateKey };
}
