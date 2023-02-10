const { ethers, upgrades, network } = require("hardhat");
import { readFile, writeFile } from "node:fs/promises";
import { access, constants, mkdir } from "node:fs";

import config from "./../constants/config";

const isFileExist = (path: string) => {
  return new Promise((resolve, reject) => {
    access(path, constants.F_OK, (err) => {
      if (err) return resolve(false);
      resolve(true);
    });
  });
};

async function main() {
  console.info("Deployment Started ...");

  const NFT = await ethers.getContractFactory("NFT");
  const ZetaConsumer = await ethers.getContractFactory(
    "ZetaTokenConsumerUniV2"
  );
  const connectorAddress = config[network.name].connectorAddress;
  const zetaTokenAddress = config[network.name].zetaTokenAddress;
  const uniswapV2RouterAddress = config[network.name].uniswapRouterV2Address;

  const _dstGasLimit = 1000000;
  let zetaConsumerAddress = config[network.name].zetaTokenAddress; // default, which is not correct
  let zetaConsumer;

  if (network.name == "goerli") {
    // I don't have routerv2 address for polygon mumbai, that's why deploying consumer for goerli only and also I only need to transfer from goerli -> polyygonmumbai
    zetaConsumer = await ZetaConsumer.deploy(
      zetaTokenAddress,
      uniswapV2RouterAddress
    );
    await zetaConsumer.deployed();

    zetaConsumerAddress = zetaConsumer.address;
  }

  const nft = await NFT.deploy(
    connectorAddress,
    zetaTokenAddress,
    zetaConsumerAddress,
    _dstGasLimit
  );
  await nft.deployed();

  console.log("NFT contract deployed to ", nft.address);

  const path = `${__dirname}/artifacts`;

  if (!(await isFileExist(`${path}`))) {
    await new Promise((resolve, reject) => {
      mkdir(path, { recursive: true }, (err) => {
        if (err) return reject("error while creating dir");
        resolve("created");
      });
    });
  }

  if (!(await isFileExist(`${path}/deploy.json`))) {
    await writeFile(`${path}/deploy.json`, "{}");
  }

  const prevDetails = await readFile(`${path}/deploy.json`, {
    encoding: "utf8",
  });

  const prevDetailsJson: { [network: string]: string } = await JSON.parse(
    prevDetails
  );
  let newDeployData = {
    ...prevDetailsJson,
    [network.name]: {
      nft: nft.address,
      _zetaConsumer: zetaConsumerAddress,
    },
  };
  await writeFile(`${path}/deploy.json`, JSON.stringify(newDeployData));
  console.log("Deploy file updated successfully!");
}

main()
  .then(() => console.info("Deploy complete !!"))
  .catch(console.error);
