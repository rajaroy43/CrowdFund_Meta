import { Signer } from "ethers";
import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";
import { parseEther } from "ethers/lib/utils";
import { ethers, upgrades } from "hardhat";

const func: DeployFunction = async function ({
    getNamedAccounts,
    deployments,
}) {
    const { deploy } = deployments;
    const { deployer } = await getNamedAccounts();

    const goal = parseEther("50");
    // @ts-ignore
    const block = await ethers.provider.getBlock();
    const One_Day = 86400;
    const One_Day_Expiry = block.timestamp + One_Day;
    const erc20TokenTx = await deploy("MockErc20", {
        from: deployer,
        args: ["MetaCrafter", "MCT", parseEther("1000000")],
    });
    console.log("erc20Token deployed to:", erc20TokenTx.address);

    const Crowdfunding = await ethers.getContractFactory("Crowdfunding");

    const crowdfunding = await upgrades.deployProxy(Crowdfunding, [
        erc20TokenTx.address,
        goal,
        One_Day_Expiry,
    ]);
    await crowdfunding.deployed();
    console.log("crowdfunding deployed to:", crowdfunding.address);
};
export default func;
