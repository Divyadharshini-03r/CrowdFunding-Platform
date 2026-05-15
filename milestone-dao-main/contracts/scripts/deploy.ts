import { ethers, network } from "hardhat";
import * as fs from "fs";
import * as path from "path";

async function main() {
  const [deployer] = await ethers.getSigners();
  const goal = ethers.parseEther("1");
  const deadline = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // +7 days

  console.log(`Deploying CrowdfundingDAO from ${deployer.address} on ${network.name}`);
  const factory = await ethers.getContractFactory("CrowdfundingDAO");
  const contract = await factory.deploy(deployer.address, goal, deadline);
  await contract.waitForDeployment();
  const address = await contract.getAddress();

  console.log(`Deployed at: ${address}`);

  const out = path.resolve(__dirname, "../deployments");
  fs.mkdirSync(out, { recursive: true });
  fs.writeFileSync(
    path.join(out, `${network.name}.json`),
    JSON.stringify({ address, args: [deployer.address, goal.toString(), deadline] }, null, 2),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
