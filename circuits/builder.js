require('dotenv').config()

const { execSync } = require('child_process')
const crypto = require('crypto')
const fs = require('fs')
const path = require('path')
const glob = require('glob')
const yargs = require('yargs/yargs')(process.argv.slice(2))

const { argv } = (
  yargs
  .options({
    c: {
      alias: 'circuits',
      description: 'Circuts to generate proofs for',
      type: 'string',
      default: '${circuitsDir}/*',
    },
    w: {
      alias: 'wasm-dir',
      description: 'Path for where to store WASM output',
      type: 'string',
      default: 'build/circuits',
    },
    z: {
      alias: 'zkey-dir',
      description: 'Path for where to store zkey output',
      type: 'string',
      default: 'build/keys',
    },
    a: {
      alias: 'hash-dir',
      description: 'Path for where powers of tau are stored',
      type: 'string',
      default: 'build/ptaus',
    },
    r: {
      alias: 'circuits-dir',
      description: 'Path for where to find Circom directories',
      type: 'string',
      default: 'circuits',
    },
    p: {
      alias: 'pot-size',
      description: 'Maximum number of iterations in the proof (2^p)',
      type: 'number',
      default: 20,
    },
    d: {
      alias: 'deterministic',
      description: 'Use $beacon to generate the SNARK',
      type: 'boolean',
      default: false,
    },
    o: {
      alias: 'overwrite',
      description: 'Overwrite existing files',
      type: 'boolean',
      default: false,
    },
    b: {
      alias: 'contributions',
      description: 'Number of random contributions to the powers of tau',
      type: 'number',
      default: 1,
    },
    v: {
      alias: 'verify-taus',
      description: 'Verify the powers of tau file',
      type: 'boolean',
      default: false,
    },
  })
  .help('h')
  .alias('h', 'help')
)

if(argv.help) {
  yargs.showHelp()
  process.exit(-4)
}

let {
  circuits,
  potSize,
  wasmDir,
  zkeyDir,
  hashDir,
  circuitsDir,
  deterministic,
  overwrite,
  contributions: numContributions,
  verifyTaus,
} = argv

if(circuits === '${circuitsDir}/*') {
  circuits = `${circuitsDir}/*`
}

if(circuits.includes(',')) {
  circuits = circuits.split(/,/g)
} else {
  if(!circuits.startsWith('/') && !circuits.startsWith(circuitsDir)) {
    circuits = path.join(circuitsDir, circuits)
  }
  circuits = (
    glob.sync(circuits)
    .filter((dir) => (
      fs.existsSync(dir) && fs.lstatSync(dir).isDirectory()
    ))
  )
}

// TODO: add an option to generate with entropy for production keys

if (circuits.length === 0) {
  yargs.showHelp()
  process.exit(-2)
}

const exec = (command) => {
  console.info(`Running: "${command}"`)
  return (
    execSync(command, { stdio: 'inherit' })
  )
}

const exists = (...files) => (
  files
  .map((file) => fs.existsSync(file))
  .reduce((acc, val) => acc && val, !overwrite)
)

const randString = (numBytes, { enc = 'utf16le' } = {}) => (
  crypto.randomBytes(numBytes).toString(enc)
)

const escape = (string) => (
  string.replace(/\\/g, '\\\\').replace(/'/g, '\\\'')
)

for (const source of circuits) {
  const name = source.replace(/.*\//g, '')

  // doesn't catch yet
  // https://github.com/iden3/snarkjs/pull/75
  try {
    const cwd = `${process.cwd()}/`
    const relPath = (
      __dirname.startsWith(cwd)
      ? __dirname.slice(cwd.length)
      : __dirname
    )
    const outDir = path.join(relPath, '..', wasmDir, name)
    const keyDir = path.join(relPath, '..', zkeyDir, name)
    const ptauDir = path.join(relPath, '..', hashDir)
    const jsDir = path.join(outDir, 'circuit_js')

    const circomIn = path.join(cwd, source, 'circuit.circom')
    const r1csOut = path.join(outDir, 'circuit.r1cs')
    const wasmOut = path.join(jsDir, 'circuit.wasm')

    if(exists(r1csOut, wasmOut)) {
      console.info(`Skipping Generation Of: ${r1csOut} & ${wasmOut}`)
    } else {
      exec(`mkdir -p "${outDir}"`)
      process.chdir(outDir)
      exec(`circom ${circomIn} --r1cs --wasm --sym`)
      process.chdir(cwd)
    }

    exec(`npx snarkjs r1cs info "${r1csOut}"`)

    const potIn = path.join(ptauDir, `pot${potSize}_final.ptau`)

    if(exists(potIn)) {
      console.info(`Skipping Generation Of: ${potIn}`)
    } else {
      const pot = Array.from(
        { length: numContributions + 1 },
        (_, i) => path.join(
          ptauDir,
          `pot${potSize}_${i.toString().padStart(4, '0')}.ptau`
        ),
      )

      exec(`mkdir -p "${ptauDir}"`)

      exec(
        'npx snarkjs powersoftau new bn128 '
        + `${potSize} ${pot[0]}`
      )

      for(let i = 0; i < numContributions; i++) {
        exec(
          'npx snarkjs powersoftau contribute '
          + `${pot[i]} ${pot[i + 1]} `
          + `--name="Contribution #${i + 1}" `
          + `-e='${escape(randString(48))}'`
        )
      }

      const potBeacon = (
        path.join(ptauDir, `pot${potSize}_beacon.ptau`)
      )

      exec(
        'npx snarkjs powersoftau beacon '
        + `${pot[numContributions]} ${potBeacon} `
        + `${randString(32, { enc: 'hex' })} 10 `
        + '-n="Final Beacon"'
      )

      exec(
        'npx snarkjs powersoftau prepare phase2 '
        + `${potBeacon} ${potIn}`
      )
    }

    if(!verifyTaus) {
      console.info(`Skipping Verification Of: ${potIn}`)
    } else {
      exec(`npx snarkjs powersoftau verify ${potIn}`)
    }

    const keyOut = path.join(keyDir, 'circuit.zkey')

    if(exists(keyOut)) {
      console.info(`Skipping Generation Of: ${keyOut}`)
    } else {
      exec(`mkdir -p "${keyDir}"`)
      exec(
        `npx snarkjs zkey new "${r1csOut}" "${potIn}" "${keyOut}"`,
      )
    }

    const newKeyOut = path.join(keyDir, 'new_circuit.zkey')

    if(exists(newKeyOut)) {
      console.info(`Skipping Generation Of: ${newKeyOut}`)
    } else {
      if(deterministic) {
        if(!process.env.beacon) {
          console.error('Missing environment variable $beacon.')
          console.error('It can be generated in Node with:')
          console.error("  require('crypto').randomBytes(32).toString('hex')")
          process.exit(-6)
        }

        exec(
          `npx snarkjs zkey beacon `
          + `"${keyOut}" "${newKeyOut}" `
          + `"${process.env.beacon}" 10`,
        )
      } else {
        exec(
          `npx snarkjs zkey contribute `
          + `"${keyOut}" "${newKeyOut}" `
          + `-e="${Date.now()}"`,
        )
      }
    }

    const verifyKeyOut = path.join(keyDir, 'verification_key.json')

    if(exists(verifyKeyOut)) {
      console.info(`Skipping Generation Of: ${verifyKeyOut}`)
    } else {
      exec(
        'npx snarkjs zkey export verificationkey '
        + `"${newKeyOut}" "${verifyKeyOut}"`,
      )
    }

    const jsonIn = path.join(source, 'input.json')
    const genScript = path.join(jsDir, 'generate_witness.js')
    const witnessOut = path.join(outDir, 'witness.wtns')

    if(exists(witnessOut)) {
      console.info(`Skipping Generation Of: ${witnessOut}`)
    } else {
      exec(
        `node "${genScript}" "${wasmOut}" "${jsonIn}" `
        + `"${witnessOut}"`
      )
    }

    const proofOut = path.join(outDir, 'proof.json')
    const pubOut = path.join(outDir, 'public.json')

    if(exists(proofOut, pubOut)) {
      console.info(`Skipping Generation Of: ${proofOut} & ${pubOut}`)
    } else {
      exec(
        'npx snarkjs groth16 prove '
        + `"${newKeyOut}" "${witnessOut}" `
        + `"${proofOut}" "${pubOut}"`,
      )
    }

    exec(
      'npx snarkjs groth16 verify '
      + `"${verifyKeyOut}" "${pubOut}" "${proofOut}"`,
    )
  } catch (error) {
    console.error(error)
    process.exit(-10)
  }
}
