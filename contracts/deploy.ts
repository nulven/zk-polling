require('dotenv').config({ path: __dirname + '/../.env' });
const { Contract, ContractFactory, providers, Wallet } = require("ethers");
const linker = require("solc/linker");
const solc = require("solc");
const fs = require("fs");

const projectId = process.env.PROJECT_ID;
const network_url = process.env.NODE_ENV === "production" ? `https://ropsten.infura.io/v3/${projectId}` : 'http://localhost:8545';
const provider = new providers.JsonRpcProvider(network_url);

const mnemonic = process.env.MNEMONIC;
const path = process.env.WALLET_PATH;
const walletMnemonic = Wallet.fromMnemonic(mnemonic, path).connect(provider);
var signer;
if (process.env.NODE_ENV === 'production') {
  signer = walletMnemonic;
} else {
  signer = provider.getSigner();
}

// first string is .sol, rest do not have that ending
deploy("CoreValidator.sol", [
  "SigCheckVerifier",
  "HashCheckBitsVerifier",
  "HashCheckVerifier",
  "Pairing",
  "ContractStorage",
]);

async function deploy(fileName, libraries = []) {
  const file = getFile(fileName);

  const input = {
    language: "Solidity",
    sources: {
      [fileName]: {
        content: file,
      },
    },
    settings: {
      outputSelection: {
        "*": {
          "*": ["*"],
        },
      },
    },
  };

  function getFile(name) {
    return fs.readFileSync(`./${name}`).toString();
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
  files.forEach(([file, values]) => {
    contracts.push(...Object.entries(values));
  });

  // sort with libraries first and contract last, so that it deploys the libraries first
  contracts.sort(
    (file1, file2) =>
      libraries.includes(file2[0]) - libraries.includes(file1[0])
  );
  const librariesAddresses = {};
  const linkReferences = {};

  for (contract of contracts) {
    const deployedContract = await createContract(contract);
    deployedContracts.push(deployedContract);
  }

  async function createContract([name, contract]) {
    var bytecode = contract.evm.bytecode.object;
    const abi = contract.abi;

    // iterate through the link references
    Object.entries(contract.evm.bytecode.linkReferences).forEach(
      ([link, references]) => {
        Object.entries(references).forEach(([libraryName, [location]]) => {
          // get the hex placeholder in the bytecode from the reference
          const hex = bytecode.slice(
            location.start * 2 + 2,
            (location.start + location.length) * 2 - 2
          );

          linkReferences[hex] = librariesAddresses[libraryName];
        });
      }
    );
    bytecode = linker.linkBytecode(bytecode, linkReferences);

    try {
      const factory = await new ContractFactory(abi, bytecode, signer);
      const contractObject = await factory.deploy();
      librariesAddresses[name] = contractObject.address;
      const folder = process.env.NODE_ENV === "production" ? 'deploy' : 'json';
      fs.writeFileSync(
        `${folder}/` + name + ".json",
        JSON.stringify({
          abi: abi,
          address: contractObject.address,
        })
      );
      
      return { name, bytecode, abi, address: contractObject.address };
    } catch (err) {
      console.log(err);
    }

  }
}
