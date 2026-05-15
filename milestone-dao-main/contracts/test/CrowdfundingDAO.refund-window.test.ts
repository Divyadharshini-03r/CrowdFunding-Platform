import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ONE_DAY = 24 * 60 * 60;
const REFUND_WINDOW = 14 * ONE_DAY;

async function deploy(goalEth = "10") {
  const [creator, alice, bob] = await ethers.getSigners();
  const goal = ethers.parseEther(goalEth);
  const deadline = (await time.latest()) + 7 * ONE_DAY;
  const Factory = await ethers.getContractFactory("CrowdfundingDAO");
  const c = await Factory.deploy(creator.address, goal, deadline);
  await c.waitForDeployment();
  return { c, creator, alice, bob, deadline };
}

describe("CrowdfundingDAO refund window", () => {
  it("rejects refund votes before project deadline", async () => {
    const { c, alice } = await deploy();
    await c.connect(alice).contribute({ value: ethers.parseEther("1") });
    await expect(c.connect(alice).castRefundVote(true)).to.be.revertedWithCustomError(c, "DeadlineNotPassed");
  });

  it("accepts refund votes inside the window and rejects after it closes", async () => {
    const { c, alice, bob, deadline } = await deploy();
    await c.connect(alice).contribute({ value: ethers.parseEther("1") });
    await c.connect(bob).contribute({ value: ethers.parseEther("0.5") });

    // move past project deadline, still inside refund window
    await time.increaseTo(deadline + ONE_DAY);
    await expect(c.connect(alice).castRefundVote(true)).to.emit(c, "RefundVoteCast");

    // move past refund deadline
    await time.increaseTo(deadline + REFUND_WINDOW + 1);
    await expect(c.connect(bob).castRefundVote(true)).to.be.revertedWithCustomError(c, "WindowClosed");
  });

  it("blocks executeRefund while window is open and allows it after with majority", async () => {
    const { c, alice, bob, deadline } = await deploy("10");
    await c.connect(alice).contribute({ value: ethers.parseEther("1") });
    await c.connect(bob).contribute({ value: ethers.parseEther("0.5") });

    await time.increaseTo(deadline + ONE_DAY);
    await c.connect(alice).castRefundVote(true);
    await c.connect(bob).castRefundVote(true);

    await expect(c.executeRefund([alice.address, bob.address])).to.be.revertedWithCustomError(c, "WindowOpen");

    await time.increaseTo(deadline + REFUND_WINDOW + 1);
    await expect(c.executeRefund([alice.address, bob.address])).to.emit(c, "RefundExecuted");
  });

  it("rejects executeRefund without majority", async () => {
    const { c, alice, bob, deadline } = await deploy("10");
    await c.connect(alice).contribute({ value: ethers.parseEther("1") });
    await c.connect(bob).contribute({ value: ethers.parseEther("1") });
    await time.increaseTo(deadline + ONE_DAY);
    await c.connect(alice).castRefundVote(false);
    await c.connect(bob).castRefundVote(true);
    await time.increaseTo(deadline + REFUND_WINDOW + 1);
    await expect(c.executeRefund([alice.address, bob.address])).to.be.revertedWithCustomError(c, "NoMajority");
  });
});
