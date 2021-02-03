const circuitPath = '/circuits/circuits-compiled/';
const keyPath = '/circuits/keys/';

// HELPERS
async function prove(circuit, inputs) {
  // prove that the signature is produced by the private key of the given public key
  const { proof, publicSignals } = 
    await snarkjs.groth16.fullProve(
      inputs,
      circuitPath + circuit + '/circuit.wasm',
      keyPath + circuit + '/circuit_final.zkey'
    );

  return { proof, publicSignals };
}

async function verify(circuit, proof, publicSignals) {
  const vKey = await fetch(
    keyPath + circuit + '/verification_key.json'
  ).then(function(res) {
    return res.json();
  });

  const res = await snarkjs.groth16.verify(vKey, publicSignals, proof);
  return res;
}


// PROVERS
export async function proveHash(preImage, hash) {
  return prove('hash', { x: preImage, hash });
}

export async function proveSignature(publicKey, hashes, sigR8, sigS, message) {
  // prove that the signature is produced by the private key of the given public key
  return prove('sig-check', { publicKey, hashes, sigR8, sigS, message });
}

export async function verifyHash(proof) {
  return verify('hash', proof.proof, proof.publicSignals);
}


// FULL VERIFIERS
export async function fullVerifyHash(key, hash) {
  const { proof, publicSignals } = await prove('hash', { x: key, hash: hash });

  return verify('hash', proof, publicSignals);
}

export async function verifySignature(proof) {
  return verify('sig-check', proof.proof, proof.publicSignals);
}
