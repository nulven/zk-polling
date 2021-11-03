require('dotenv').config()

const { execSync } = require('child_process')
const fs = require('fs')
const yargs = require('yargs');

const { argv } = (
  yargs
  .usage(
    'Usage: $0 '
    + '-c | --circuits=../circuits/* '
    + '-w | --wasmOut=wasm '
    + '-z | --zkeyOut=zkey '
    + '-d | --deterministic=false '
    + '-p | --potSize=15 '
    + '-h | --help'
  )
  .example('$0', 'deploy all the circuits to a local ethernet node')
  .option('circuits', {
    alias: 'c',
    description: 'Circuts to generate proofs for',
    type: 'string',
    default: '',
  })
  .option('wasmOut', {
    alias: 'w',
    description: 'Path for where to store WASM output',
    type: 'string',
    default: 'wasm',
  })
  .option('zkeyOut', {
    alias: 'z',
    description: 'Path for where to store zKey output',
    type: 'string',
    default: 'zkey',
  })
  .option('potSize', {
    alias: 'p',
    description: 'Maximum number of iterations in the proof',
    type: 'number',
    default: 15,
  })
  .option('deterministic', {
    alias: 'd',
    description: 'Use $beacon to generate the SNARK',
    type: 'boolean',
  })
  .help('h')
  .alias('h', 'help')
)

console.info({ argv })

const circuitsList = argv.circuits
const wasmOutPath = process.argv[3] ?? 'wasm'
const zkeyOutPath = process.argv[4] ?? 'zkey'
const deterministic = process.argv[5] === 'true'
let potSize = process.argv[6] ?? '15'

// TODO: add an option to generate with entropy for production keys

if (!circuitsList) {
  console.log('Usage:')
  console.log(
    '  builder comma,separated,compile,list wasmOutPath zkeyOutPath [`true` if deterministic, `false` otherwise] pot_size \n for example, $ node circuits/builder.js . . false sig-check 20'
  )
  process.exit(-2)
}

const cwd = process.cwd()

for (const circuitName of circuitsList.split(',')) {
  if (deterministic && !process.env.beacon) {
    console.error("Eʀʀᴏʀ: Can't find an environment variable: $beacon")
    process.exit(-3)
  }

  process.chdir(`${cwd}/circuits/${circuitName}`)

  // doesnt catch yet
  // https://github.com/iden3/snarkjs/pull/75
  try {
    execSync(
      'npx circom circuit.circom --r1cs --wasm --sym',
      { stdio: 'inherit' },
    )
    execSync(
      'npx snarkjs r1cs info circuit.r1cs',
      { stdio: 'inherit' },
    )
    const potsOut = `${__dirname}/pots/pot${potSize}_final.ptau`
    const circuitKey = `circuit_${circuitName}.zkey`
    execSync(
      `npx snarkjs zkey new circuit.r1cs `
      + `"${potsOut}" "${circuitKey}"`,
      { stdio: 'inherit' },
    )
    if (deterministic) {
      execSync(
        `npx snarkjs zkey beacon `
        + `"${circuitKey}" circuit.zkey `
        + `${process.env.beacon} 10`,
        { stdio: 'inherit' },
      )
    } else {
      execSync(
        `npx snarkjs zkey contribute `
        + `${circuitKey} circuit.zkey `
        + `-e="${Date.now()}"`,
        { stdio: 'inherit' },
      )
    }
    execSync(
      'npx snarkjs zkey export verificationkey circuit.zkey verification_key.json',
      { stdio: 'inherit' },
    )
    execSync(
      'npx snarkjs wtns calculate circuit.wasm input.json witness.wtns',
      { stdio: 'inherit' },
    )
    execSync(
      'npx snarkjs groth16 prove circuit.zkey witness.wtns proof.json public.json',
      { stdio: 'inherit' },
    )
    execSync(
      'npx snarkjs groth16 verify verification_key.json public.json proof.json',
      { stdio: 'inherit' },
    )
    execSync(
      `mkdir -p ../circuits-compiled/${circuitName}`,
      { stdio: 'inherit' },
    )
    execSync(
      `mkdir -p ../keys/${circuitName}`,
      { stdio: 'inherit' },
    )
    fs.copyFileSync(
      'circuit.wasm',
      `${cwd}/circuits/${wasmOutPath}/${circuitName}/circuit.wasm`
    )
    fs.copyFileSync(
      'circuit.zkey',
      `${cwd}/circuits/${zkeyOutPath}/${circuitName}/circuit_final.zkey`,
    )
    fs.copyFileSync(
      'verification_key.json',
      `${cwd}/circuits/${zkeyOutPath}/${circuitName}/verification_key.json`,
    )
  } catch (error) {
    console.error(error)
    process.exit(1)
  }
}
