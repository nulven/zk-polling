require('dotenv').config({ path: `${__dirname}/../.env` });
const { Contract, ContractFactory, providers, Wallet } = require("ethers");
const linker = require("solc/linker");
const solc = require("solc");
const fs = require("fs");

const {
  INFURA_PROJECT_ID: projectId,
  MNEMONIC: mnemonic,
  WALLET_PATH: path,
  NODE_ENV: env,
} = process.env

const network_url = (
  env === 'production'
  ? `https://ropsten.infura.io/v3/${projectId}`
  : 'http://localhost:8545'
);
const provider = new providers.JsonRpcProvider(network_url);

const wallet = (
  Wallet.fromMnemonic(mnemonic, path).connect(provider)
);
var signer;
if (env === 'production') {
  signer = wallet;
} else {
  signer = provider.getSigner();
}

// first string is .sol, rest do not have that ending
deploy('CoreValidator.sol', [
  'SigCheckVerifier',
  'HashCheckBitsVerifier',
  'HashCheckVerifier',
  'Pairing',
  'ContractStorage',
]);

async function deploy(fileName, libraries = []) {
  const file = getFile(fileName);

  const input = {
    language: 'Solidity',
    sources: {
      [fileName]: {
        content: file,
      },
    },
    settings: {
      outputSelection: {
        '*': {
          '*': ['*'],
        },
      },
    },
  };

  function getFile(name) {
    return fs.readFileSync(`${__dirname}/${name}`).toString();
  }

  function findImports(path) {
    return { contents: getFile(path) };
  }

  const output = JSON.parse(
    solc.compile(JSON.stringify(input), { import: findImports })
  );

  const files = Object.entries(output.contracts);
  const contracts = [];
  const deployedContracts = [];

  // flatten the solidity files so each contract is at depth 1
  files.forEach(([_file, values]) => {
    contracts.push(...Object.entries(values));
  });

  // sort with libraries first and contract last, so that it deploys the libraries first
  contracts.sort((file1, file2) => {
    const [f1Lib, f2Lib] = [file1[0], file2[0]].map(
      (file) => libraries.includes(file)
    )
    if(!f1Lib && f2Lib) return 1
    if(f1Lib && !f2Lib) return -1
    return 0
  });
  const librariesAddresses = {};
  const linkReferences = {};

  for (const contract of contracts) {
    const deployedContract = await createContract(contract);
    deployedContracts.push(deployedContract);
  }

  async function createContract([name, contract]) {
    var bytecode = contract.evm.bytecode.object;
    const abi = contract.abi;

    // iterate through the link references
    try {
      Object.entries(contract.evm.bytecode.linkReferences).forEach(
        ([_link, references]) => {
          Object.entries(references).forEach(
            ([libraryName, [location]]) => {
              // get the hex placeholder in the bytecode from the reference
              const hex = bytecode.slice(
                location.start * 2 + 2,
                (location.start + location.length) * 2 - 2,
              );

              linkReferences[hex] = librariesAddresses[libraryName];
            }
          );
        }
      );
      bytecode = linker.linkBytecode(bytecode, linkReferences);

      const factory = await new ContractFactory(
        abi, bytecode, signer
      );
      const contractObject = await factory.deploy();
      librariesAddresses[name] = contractObject.address;
      const folder = env === 'production' ? 'deploy' : 'json';
      fs.writeFileSync(
        `${__dirname}/${folder}/${name}.json`,
        JSON.stringify(
          {
            abi: abi,
            address: contractObject.address,
          },
          null,
          2,
        )
      );
      
      console.log(name, contractObject.address);
      return {
        name, bytecode, abi, address: contractObject.address,
      };
    } catch (err) {
      console.error(err.message ?? err);
    }
  }
}
