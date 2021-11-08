pragma circom 2.0.0;

include "../../node_modules/circomlib/circuits/mimcsponge.circom";

template Main() {
  signal input x[256];
  signal input hash;

  signal output out;

  component mimc = MiMCSponge(256, 220, 1);
  for (var i=0; i<256; i++) {
    x[i] ==> mimc.ins[i];
  }
  mimc.k <== 0;

  out <== mimc.outs[0];

  out === hash;
}

component main = Main();
