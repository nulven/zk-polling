pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/mimcsponge.circom";
include "../../node_modules/circomlib/circuits/eddsa.circom";
include "../../node_modules/circomlib/circuits/bitify.circom";

template Main(n) {
  signal input publicKey[256];
  signal input hashes[n];
  signal input sigR8[256];
  signal input sigR8Halves[2]; // Import the 256 bit signature as two halves
  signal input sigS; // Signature within prime field
  signal input message; // hash of message/message assumed to be within prime field

  // Two converters, one per each half of converting the R8 half to bits
  component sigR8Converter1 = Num2Bits(128);
  component sigR8Converter2 = Num2Bits(128);
  sigR8Converter1.in <== sigR8Halves[0];
  sigR8Converter2.in <== sigR8Halves[1];
  signal sigR8Bits[256];

  for (var i=0; i<128; i++) {
      sigR8Converter1.out[i] ==> sigR8Bits[i];
      sigR8[i] === sigR8Bits[i];
  }

  for (var i=0; i<128; i++) {
      sigR8Converter2.out[i] ==> sigR8Bits[128 + i];
      sigR8[128+i] === sigR8Bits[128+i];
  }

  component mimc = MiMCSponge(256, 220, 1);
  for (var i=0; i<256; i++) {
    mimc.ins[i] <== publicKey[i];
  }
  mimc.k <== 0;

  signal poly[n+1];
  var check[n];
  poly[0] <== 1;
  for (var i=0; i<n; i++) {
    check[i] = mimc.outs[0] - hashes[i];
    poly[i+1] <== poly[i] * check[i];
  }
  poly[n] === 0;

  component eddsa = EdDSAVerifier(256);

  component bits1 = Num2Bits(256);
  component bits2 = Num2Bits(256);

  bits1.in <== sigS;
  bits2.in <== message;
  for (var i=0; i<256; i++) {
    publicKey[i] ==> eddsa.A[i];
    sigR8Bits[i] ==> eddsa.R8[i];
    bits1.out[i] ==> eddsa.S[i];
    bits2.out[i] ==> eddsa.msg[i];
  }
}

component main = Main(10);
