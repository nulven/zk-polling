# Zero Knowledge Message Board

A public message board, hosted on a solidity contract, that uses ZK-SNARKS to allow a user to register their identity as a member of a group and post messages on behalf of the group without revealing their identity. Currently, this implementation is only semi-decentralized as it uses a central server to send the transactions on behalf of the user, but there are ways to change this with a little more effort.

## Setup and Run

Use Node v14. If you don't have it, do:

```
nvm install 14.15.3
npm -v # 14.15.3
```

Start your own hardhat chain:

```
npx hardhat node
```

Use Node v14:
```
nvm use 14.15.3
npm install
node contracts/deploy.ts
npm run compile-dev hash-check 15
npm run compile-dev hash-check-bits 20
npm run compile-dev sig-check 20
npm run compile hash-check 15
npm run compile hash-check-bits 20
npm run compile sig-check 20
```

Run the local server and client watcher

```
npm run dev
```

View localhost:8080

## Circuits

| Circuit Name | Private Inputs | Public Inputs              | Outputs | Description                                                                                           |
| ------------ | -------------- | -------------------------- | ------- | ----------------------------------------------------------------------------------------------------- |
| `hash-check`       | `x`            | `hash`                     | `out`   | Checks if `MiMC(x) = hash`; outputs `MiMC(x)`                                                         |
| `hash-check-bits` | `x` (256-bit list) | `hash`                   | `out` | Checks if `MiMC(x) = hash`; outputs `MiMC(x)`                                                               |
| `sig-check`  | `publicKey`    | `hashes`, `sig`, `message` | None    | Checks `eddsa_verify(publicKey, sig, message) == true`; checks `MiMIC(publicKey)` is in list `hashes` |

### 'hash-check'

| Inputs      | Private | Type               | Description                                           |
| ----------- | ------- | ------------------ | ----------------------------------------------------- |
| 'x' | Yes     | 256-bit integer            | MiMC hash pre-image |
| 'hash'    | No      | 256-bit integer      | MiMC hash |

### 'hash-check-bits'

| Inputs      | Private | Type               | Description                                           |
| ----------- | ------- | ------------------ | ----------------------------------------------------- |
| 'x' | Yes     | 256-bit array            | MiMC hash pre-image |
| 'hash'    | No      |  256-bit integer     | MiMC hash |

### 'sig-check'

| Inputs      | Private | Type               | Description                                           |
| ----------- | ------- | ------------------ | ----------------------------------------------------- |
| 'publicKey' | Yes     | 256-bit            | EdDSA public key                                      |
| 'hashes'    | No      | `[]`               | Registered public key hashes                          |
| 'sig'       | No      | 2-by-256-bit array | EdDSA signature                                       |
| 'message'   | No      | 312-bit array      | binary representation of the MiMC hash of the message |

Example use

```
import { babyJub, eddsa } from 'circomlib';
import mimc from 'client/utils/mimc';

function buffer2bits(buff) {
    const res = [];
    for (let i=0; i<buff.length; i++) {
        for (let j=0; j<8; j++) {
            if ((buff[i]>>j)&1) {
                res.push('1');
            } else {
                res.push('0');
            }
        }
    }
    return res;
}

const message = mimc(1234).toString().padStart(78, '0');
const msg = Buffer.from(message, "hex");

const prvKey = Buffer.from("0001020304050607080900010203040506070809000102030405060708090001", "hex");

const pubKey = eddsa.prv2pub(prvKey);

const pPubKey = babyJub.packPoint(pubKey);

const signature = eddsa.sign(prvKey, msg);

const pSignature = eddsa.packSignature(signature);

const aBits = buffer2bits(pPubKey);
const rBits = buffer2bits(pSignature.slice(0, 32));
const sBits = buffer2bits(pSignature.slice(32, 64));
const msgBits = buffer2bits(msg);

const sig = [rBits, sBits];

const hash = mimc(...aBits).toString();

const inputs = { publicKey: aBits, hashes: [hash], signature: sig, message: msgBits };
```

## Add a circuit

Make a new directory in `/circuits/` with the name of the circuit.

Copy the `pot15_final.ptau` file from `/circuits/hash` into the new directory.

In the new directory, create `circuit.circom` and `input.json` with the test inputs.

Run `npm run compile CIRCUIT_NAME`, if that doesn't work `npm run compile CIRCUIT_NAME 20`. If it complains about an env file in development, use `compile-dev` instead of `compile`.
If the circuit and input produce a valid proof you should see `OK`.

The compiled `circuit.wasm` file will be in `/circuits/circuits-compiled/CIRCUIT_NAME`.
The proof key `circuit_final.zkey` and the verification key `verification_key.json` will be found in `/circuits/keys/CIRCUIT_NAME`.

An example of creating and verifying a new proof in Node can be found in `/client/prover.js`.

Run `./solbuilder.js` to generate Solidity from the contracts.

## How it works

1. User generates EdDSA key pair `(pk, sk)` and sends the MiMC hash to the server `H(pk)`.
2. To vote, the user first proves they're registered to the poll by sending a snark proving that they have a public key `pk` to one of the recorded MiMC hashes.
3. Then, the user sends an EdDSA signature of the vote and a snark proving that the signature was produced by the private key associated with the public key they just verified.

Valid `sig = EdDSA(sk, msg)`
where `pk = private2public(sk)`
and `H(pk)` is a recorded hash

## Poll Database

All of the poll information is stored locally in `.txt` files.

`/server/polls` stores the data in separate files named `POLL_ID.txt`, where the first line is as follows

```
POLL_ID,TITLE,MAX_USERS
```

Each line after this is a MiMC hash of a user who registered with the poll.

`/server/votes` stores the vote in separate files named `POLL_ID.txt`, where each line represents one vote

```
VOTE,SIGNATURE
```

## Environment Variables

.env has a beacon to do the MPC. Also, node_env can be development which simply queries the local hardhat chain, or production which queries ropsten.

## Common Errors

```
When I call a contract from frontend, some path doesnt work -- I see 'call revert exception' or 'calling an account which is not a contract'
```

The chain probably doesn't know the contract address. In our experience, restarting chain and redeploying has worked for us.
