import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-network-helpers";

const ONE_DAY = 24 * 60 * 60;

async function deploy() {
  const [creator, alice] = await ethers.getSigners();
  const goal = ethers.parseEther("10");
  const deadline = (await time.latest()) + 7 * ONE_DAY;
  const Factory = await ethers.getContractFactory("CrowdfundingDAO");
  const c = await Factory.deploy(creator.address, goal, deadline);
  await c.waitForDeployment();
  return { c, creator, alice };
}

describe("CrowdfundingDAO media attestation", () => {
  it("only the creator can attest media", async () => {
    const { c, alice } = await deploy();
    await expect(
      c.connect(alice).attestMedia("QmImg", "QmDesc"),
    ).to.be.revertedWithCustomError(c, "NotCreator");
  });

  it("emits MediaAttested and stores keccak hashes", async () => {
    const { c, creator } = await deploy();
    const img = "QmImageCid";
    const desc = "QmDescriptionCid";
    await expect(c.connect(creator).attestMedia(img, desc))
      .to.emit(c, "MediaAttested")
      .withArgs(img, desc, ethers.keccak256(ethers.toUtf8Bytes(img)), ethers.keccak256(ethers.toUtf8Bytes(desc)));

    expect(await c.imageCid()).to.equal(img);
    expect(await c.descriptionCid()).to.equal(desc);
    expect(await c.imageCidHash()).to.equal(ethers.keccak256(ethers.toUtf8Bytes(img)));
  });

  it("verifyMedia returns true only for matching CIDs", async () => {
    const { c, creator } = await deploy();
    await c.connect(creator).attestMedia("QmA", "QmB");
    expect(await c.verifyMedia("image", "QmA")).to.equal(true);
    expect(await c.verifyMedia("image", "QmX")).to.equal(false);
    expect(await c.verifyMedia("description", "QmB")).to.equal(true);
    expect(await c.verifyMedia("description", "QmA")).to.equal(false);
    expect(await c.verifyMedia("other", "QmA")).to.equal(false);
  });

  it("rejects empty CID pairs", async () => {
    const { c, creator } = await deploy();
    await expect(c.connect(creator).attestMedia("", "")).to.be.revertedWithCustomError(c, "EmptyCid");
  });
});
