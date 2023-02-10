import { expect } from "chai";
const { ethers, upgrades, network } = require("hardhat");
import { ERC20__factory, UniswapV2Router02__factory } from "../typechain-types";
import { MaxUint256 } from "@ethersproject/constants";

describe("NFT", function () {
  let signer;
  let accounts;

  let zetaEthTokenMockContract;
  let zetaConnectorMockContract;
  let zetaTokenConsumerUniV2;

  let localNFT;
  let remoteNFT;
  let WETH;

  const _dstGasLimit = 1000000;

  const localChainId: number = 1;
  const remoteChainId: number = 2;

  let uniswapV2Factory;
  let uniswapV2Router02;

  const addZetaEthLiquidityTest = async (zetaToAdd, ETHToAdd) => {
    const tx1 = await zetaEthTokenMockContract.approve(
      uniswapV2Router02.address,
      MaxUint256
    );
    await tx1.wait();

    const block = await ethers.provider.getBlock("latest");
    const tx2 = await uniswapV2Router02.addLiquidityETH(
      zetaEthTokenMockContract.address,
      zetaToAdd,
      0,
      0,
      signer.address,
      block.timestamp + 360,
      { gasLimit: 10_000_000, value: ETHToAdd }
    );
    await tx2.wait();
  };

  const deployRouterV2 = async () => {
    const UniswapV2Factory = await ethers.getContractFactory(
      "UniswapV2Factory"
    ); // address _feeToSetter
    uniswapV2Factory = await UniswapV2Factory.deploy(signer.address);
    await uniswapV2Factory.deployed();

    const UniswapV2Router02 = await ethers.getContractFactory(
      "UniswapV2Router02"
    ); // address _factory, address _WETH
    uniswapV2Router02 = await UniswapV2Router02.deploy(
      uniswapV2Factory.address,
      WETH.address
    );
    await uniswapV2Router02.deployed();
  };

  before(async () => {
    [signer, ...accounts] = await ethers.getSigners();

    const WETHFactory = await ethers.getContractFactory("WETH");
    WETH = await WETHFactory.deploy(10000);
    WETH.deployed();

    const ZetaEthTokenMockContractFactory = await ethers.getContractFactory(
      "ZetaEthMock"
    );
    zetaEthTokenMockContract = await ZetaEthTokenMockContractFactory.deploy(
      10000
    );
    await zetaEthTokenMockContract.deployed();

    await deployRouterV2();

    const zetaTokenConsumerUniV2Factory = await ethers.getContractFactory(
      "ZetaTokenConsumerUniV2"
    );

    zetaTokenConsumerUniV2 = await zetaTokenConsumerUniV2Factory.deploy(
      zetaEthTokenMockContract.address,
      uniswapV2Router02.address
    );
    await zetaTokenConsumerUniV2.deployed();

    // await addZetaEthLiquidityTest(
    //   ethers.utils.parseEther("200000"),
    //   ethers.utils.parseEther("100")
    // );

    // @dev: guarantee that the account has no zeta balance but still can use the protocol :D
    const zetaBalance = await zetaEthTokenMockContract.balanceOf(
      signer.address
    );
    await zetaEthTokenMockContract.transfer(accounts[5].address, zetaBalance);

    const zetaConnectorMockContractFactory = await ethers.getContractFactory(
      "CrossChainZetaConnectorMock"
    );
    zetaConnectorMockContract = await zetaConnectorMockContractFactory.deploy();
    await zetaConnectorMockContract.deployed();

    // deploy NFT crosschain
    const NFT = await ethers.getContractFactory("NFT");
    localNFT = await NFT.deploy(
      zetaConnectorMockContract.address,
      zetaEthTokenMockContract.address,
      zetaTokenConsumerUniV2.address,
      _dstGasLimit
    );
    await localNFT.deployed();

    remoteNFT = await NFT.deploy(
      zetaConnectorMockContract.address,
      zetaEthTokenMockContract.address,
      zetaTokenConsumerUniV2.address,
      _dstGasLimit
    );
    await remoteNFT.deployed();

    // set remote contract with chainId
    await localNFT.setInteractorByChainId(
      remoteChainId,
      ethers.utils.solidityPack(["address"], [remoteNFT.address])
    );

    await remoteNFT.setInteractorByChainId(
      localChainId,
      ethers.utils.solidityPack(["address"], [localNFT.address])
    );
  });
  beforeEach(async function () {});

  it("connector Setup and nft deployment to chains", () => {});
  it("nft mint", async () => {
    await localNFT.connect(signer).safeMint(signer.address, "URI", {
      value: 1, // 1wei
    });
    expect(await localNFT.ownerOf(0)).to.be.equal(signer.address);
  });

  it("Cross Chain NFT Transfer, Should mint tokenId in the destination chain", async function () {
    // mint nft on local chain
    await localNFT.connect(signer).safeMint(signer.address, "URI", {
      value: 1, // 1wei
    });

    expect(await localNFT.ownerOf(0)).to.be.equal(signer.address);
    const zetaValueAndGas = 1;
    const tx = await localNFT.transferNFTCrossChain(
      remoteChainId,
      signer.address,
      0,
      { value: 1 }
    );
    await tx.wait();

    expect(await remoteNFT.ownerOf(0)).to.be.equal(signer.address);
  });
});
