import { ethers, upgrades } from "hardhat";
import { Signer, Contract } from "ethers";
import { expect } from "chai";
import { Crowdfunding, ERC20, MockErc20 } from "../typechain";
import { parseEther } from "ethers/lib/utils";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

describe("Crowdfunding", function () {
    let owner: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let token: MockErc20;
    let crowdfunding: Crowdfunding;
    let DEADLINE: number;

    const TOKEN_SUPPLY = parseEther("1000000");
    const GOAL = parseEther("500");
    const ONE_WEEK = 60 * 60 * 24 * 7;

    beforeEach(async () => {
        [owner, user1, user2] = await ethers.getSigners();
        DEADLINE = (await ethers.provider.getBlock()).timestamp + ONE_WEEK; // 1 week from now

        const Token = await ethers.getContractFactory("MockErc20");
        token = (await Token.deploy(
            "Test Token",
            "TTok",
            TOKEN_SUPPLY
        )) as MockErc20;

        const Crowdfunding = await ethers.getContractFactory("Crowdfunding");
        crowdfunding = <Crowdfunding>(
            await upgrades.deployProxy(Crowdfunding, [
                token.address,
                GOAL,
                DEADLINE,
            ])
        );

        // Give some tokens to users
        await token.transfer(user1.address, ethers.utils.parseEther("10000"));
        await token.transfer(user2.address, ethers.utils.parseEther("10000"));
    });

    it("should initialize with the correct values", async () => {
        expect(await crowdfunding.token()).to.be.equal(token.address);
        expect(await crowdfunding.goal()).to.be.equal(GOAL);
        expect(await crowdfunding.owner()).to.be.equal(owner.address);
    });

    it("should accept pledges", async () => {
        const amount = parseEther("100");
        const initialBalance = await token.balanceOf(crowdfunding.address);

        await token.connect(user1).approve(crowdfunding.address, amount);
        await expect(crowdfunding.connect(user1).pledge(amount))
            .to.emit(crowdfunding, "FundsPledged")
            .withArgs(user1.address, amount);

        expect(await crowdfunding.pledges(user1.address)).to.equal(amount);
        expect(await crowdfunding.totalPledged()).to.equal(amount);
        expect(await token.balanceOf(crowdfunding.address)).to.equal(
            initialBalance.add(amount)
        );
    });

    it("should not allow zero amount pledges", async () => {
        await expect(crowdfunding.connect(user1).pledge(0)).to.be.revertedWith(
            "Zero amount"
        );
    });

    it("should not accept pledges after deadline", async () => {
        const amount = ethers.utils.parseEther("100");

        // Fast forward time to after the deadline
        await ethers.provider.send("evm_setNextBlockTimestamp", [DEADLINE + 1]);
        await ethers.provider.send("evm_mine", []);

        await token.connect(user1).approve(crowdfunding.address, amount);

        await expect(
            crowdfunding.connect(user1).pledge(amount)
        ).to.be.revertedWith("Deadline has passed");
    });

    it("should not allow pledges after the goal has been reached", async () => {
        const amount = parseEther("2");
        await token.connect(user1).approve(crowdfunding.address, GOAL);
        await expect(crowdfunding.connect(user1).pledge(GOAL))
            .to.emit(crowdfunding, "FundsPledged")
            .withArgs(user1.address, GOAL)
            .to.emit(crowdfunding, "GoalReached")
            .withArgs(GOAL);

        expect(await crowdfunding.goalReached()).to.be.true;

        await token.connect(user2).approve(crowdfunding.address, amount);
        await expect(
            crowdfunding.connect(user2).pledge(amount)
        ).to.be.revertedWith("Goal has already been reached");
    });

    it("should allow users to refund their pledges after the deadline if the goal has not been reached", async () => {
        const amount = ethers.utils.parseEther("100");

        // approve the token transfer first
        await token.connect(user1).approve(crowdfunding.address, amount);

        await expect(crowdfunding.connect(user1).pledge(amount))
            .to.emit(crowdfunding, "FundsPledged")
            .withArgs(user1.address, amount);
        const initialBalance = await token.balanceOf(user1.address);

        expect(await crowdfunding.pledges(user1.address)).to.equal(amount);
        expect(await crowdfunding.totalPledged()).to.equal(amount);

        await ethers.provider.send("evm_setNextBlockTimestamp", [DEADLINE + 1]);
        await ethers.provider.send("evm_mine", []);

        await expect(crowdfunding.connect(user1).refund())
            .to.emit(crowdfunding, "Refunded")
            .withArgs(user1.address, amount);
        expect(await token.balanceOf(user1.address)).to.equal(
            initialBalance.add(amount)
        );
        expect(await crowdfunding.pledges(user1.address)).to.equal(0);
        expect(await crowdfunding.totalPledged()).to.equal(0);
    });

    it("should allow the owner to withdraw funds after the goal is reached", async () => {
        const amount = parseEther("600");
        await token.connect(user1).approve(crowdfunding.address, amount);
        await expect(crowdfunding.connect(user1).pledge(amount))
            .to.emit(crowdfunding, "FundsPledged")
            .withArgs(user1.address, amount);

        const initialBalance = await token.balanceOf(owner.address);

        await expect(crowdfunding.connect(owner).withdraw())
            .to.emit(crowdfunding, "FundsWithdrawn")
            .withArgs(amount);

        expect(await token.balanceOf(owner.address)).to.equal(
            initialBalance.add(amount)
        );
    });

    it("should not allow non-owners to withdraw funds after the deadline", async () => {
        const amount = parseEther("600");
        await token.connect(user1).approve(crowdfunding.address, amount);
        await crowdfunding.connect(user1).pledge(amount);

        await expect(crowdfunding.connect(user1).withdraw()).to.be.revertedWith(
            "Ownable: caller is not the owner"
        );
    });
    it("should allow backers to refund their pledges if the goal is not reached after the deadline", async () => {
        const amount = parseEther("100");
        await token.connect(user1).approve(crowdfunding.address, amount);
        await expect(crowdfunding.connect(user1).pledge(amount))
            .to.emit(crowdfunding, "FundsPledged")
            .withArgs(user1.address, amount);

        // Fast forward time to after the deadline
        await ethers.provider.send("evm_setNextBlockTimestamp", [DEADLINE + 1]);
        await ethers.provider.send("evm_mine", []);

        const initialBalance = await token.balanceOf(user1.address);

        await expect(crowdfunding.connect(user1).refund())
            .to.emit(crowdfunding, "Refunded")
            .withArgs(user1.address, amount);

        expect(await crowdfunding.pledges(user1.address)).to.equal(0);
        expect(await crowdfunding.totalPledged()).to.equal(0);
        expect(await token.balanceOf(crowdfunding.address)).to.equal(0);
        expect(await token.balanceOf(user1.address)).to.equal(
            initialBalance.add(amount)
        );
    });

    it("should not allow 0 funds  to refund the pledges if the goal is reached after the deadline", async () => {
        const amount = parseEther("600");
        // Fast forward time to after the deadline
        await ethers.provider.send("evm_setNextBlockTimestamp", [DEADLINE + 1]);
        await ethers.provider.send("evm_mine", []);

        await expect(crowdfunding.connect(user1).refund()).to.be.revertedWith(
            "No pledge to refund"
        );
    });

    it("should not allow backers to withdraw their pledges if the goal is reached after the deadline", async () => {
        const amount = parseEther("600");
        await token.connect(user1).approve(crowdfunding.address, amount);
        await crowdfunding.connect(user1).pledge(amount);

        // Fast forward time to after the deadline
        await ethers.provider.send("evm_setNextBlockTimestamp", [DEADLINE + 1]);
        await ethers.provider.send("evm_mine", []);

        await expect(crowdfunding.connect(user1).refund()).to.be.revertedWith(
            "Goal has been reached"
        );
    });
});
