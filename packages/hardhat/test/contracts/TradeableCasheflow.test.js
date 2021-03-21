"use strict";

const { web3tx, toWad, toBN } = require("@decentral.ee/web3-helpers");
const { expectRevert } = require("@openzeppelin/test-helpers");
const deployFramework = require("@superfluid-finance/ethereum-contracts/scripts/deploy-framework");
const deployTestToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-test-token");
const deploySuperToken = require("@superfluid-finance/ethereum-contracts/scripts/deploy-super-token");
const SuperfluidSDK = require("@superfluid-finance/js-sdk");
const traveler = require("ganache-time-traveler");
const TradeableCashflow = artifacts.require("TradeableCashflow");
const { ZERO_ADDRESS } = require("@openzeppelin/test-helpers").constants;

contract("TradeableCashflow", accounts => {
  const errorHandler = err => {
    if (err) throw err;
  };

  const [admin, inflow1, inflow2, inflow3, owner, yannis, fran] = accounts;
  const inflowAccounts = [inflow1, inflow2, inflow3];
  let sf;
  let dai;
  let daix;
  let app;

  const assertBNEqual = (actualBN, expectedBN, context) => {
    assert.strictEqual(actualBN.toString(), expectedBN.toString(), context);
  };

  const assertBNGreaterThan = (aBN, bBN) => {
    assert.ok(
      aBN.gt(bBN),
      `${aBN.toString()} is not greater than ${bBN.toString()}`
    );
  };

  async function timeTravelOnce(time) {
    const _time = time || TEST_TRAVEL_TIME;
    const block1 = await web3.eth.getBlock("latest");
    // console.log('current block time', block1.timestamp);
    // console.log(`time traveler going to the future +${_time}...`);
    await traveler.advanceTimeAndBlock(_time);
    const block2 = await web3.eth.getBlock("latest");
    // console.log('new block time', block2.timestamp);
  }

  async function dropStream(sender, receiver, by) {
    await sf.cfa.deleteFlow({
      superToken: daix.address,
      sender: sender,
      receiver: receiver,
      by: by
    });

    return await sf.cfa.getFlow({
      superToken: daix.address,
      sender: sender,
      receiver: receiver
    });
  }

  async function getFlowFromUser(account) {
    return await getFlow(account, app.address);
  }

  async function getFlow(sender, receiver) {
    return await sf.cfa.getFlow({
      superToken: daix.address,
      sender: sender,
      receiver: receiver
    });
  }

  before(async function() {
    await deployFramework(errorHandler, { web3: web3, from: admin });
    await deployTestToken(errorHandler, [":", "fDAI"], {
      web3: web3,
      from: admin
    });
    await deploySuperToken(errorHandler, [":", "fDAI"], {
      web3: web3,
      from: admin
    });

    sf = new SuperfluidSDK.Framework({
      web3: web3,
      tokens: ["fDAI"],
      version: "test"
    });

    await sf.initialize();
    daix = sf.tokens.fDAIx;
    if (!dai) {
      const daiAddress = await sf.tokens.fDAI.address;
      dai = await sf.contracts.TestToken.at(daiAddress);

      const mintAmount = toWad(10000).toString();
      const approveAmount = toWad(10000).toString();

      for (let i = 0; i < inflowAccounts.length; ++i) {
        await web3tx(dai.mint, `Mint ${mintAmount} dai`)(
          inflowAccounts[i],
          mintAmount,
          {
            from: inflowAccounts[i]
          }
        );
        await web3tx(dai.approve, `Approve ${approveAmount} daix`)(
          daix.address,
          approveAmount,
          {
            from: inflowAccounts[i]
          }
        );

        await web3tx(daix.upgrade, `Upgrade ${approveAmount} DAIx`)(
          approveAmount,
          {
            from: inflowAccounts[i]
          }
        );
      }
    }

    app = await web3tx(TradeableCashflow.new, "Deploy TradeableCashflow")(
      owner,
      sf.host.address,
      sf.agreements.cfa.address,
      daix.address,
      "Future Flow",
      "FTR"
    );
  });

  afterEach(async function() {
    assert.ok(!(await sf.host.isAppJailed(app.address)), "App is Jailed");
  });

  describe("Constructor", () => {
    it("fails when owner is 0", async () => {
      await expectRevert(
        TradeableCashflow.new(
          ZERO_ADDRESS,
          sf.host.address,
          sf.agreements.cfa.address,
          daix.address,
          "Future Flow",
          "FTR"
        ),
        "receiver/owner is zero address"
      );
    });
  });

  describe("When opening streams to the contract", () => {
    // const flowRate = (1e18).toString();
    const flowRate = toWad(0.02);

    before("create inflows", async () => {
      for (let i = 0; i < inflowAccounts.length; ++i) {
        await sf.cfa.createFlow({
          superToken: daix.address,
          sender: inflowAccounts[i],
          receiver: app.address,
          flowRate: flowRate
        });
      }
    });

    it("should open the 1st stream succesfully", async () => {
      let flow = await sf.cfa.getFlow({
        superToken: daix.address,
        sender: inflow1,
        receiver: app.address
      });
      assert.equal(flow.flowRate, flowRate);
      flow = await sf.cfa.getFlow({
        superToken: daix.address,
        sender: app.address,
        receiver: owner
      });
    });

    describe("When we fast forward into the future", () => {
      before("timeTravel", async () => {
        await timeTravelOnce(3600);
      });

      it("should have updated the balance of the owner and not the one of the contract", async () => {
        assertBNEqual(await daix.balanceOf(app.address), "0");
        assertBNGreaterThan(await daix.balanceOf(owner), "0");
      });

      describe("An NFT is minted and given to the buyer", () => {
        const nftFlowRate = toWad(0.01);
        before("mint & transfer NFT", async () => {
          await app.createNFT(nftFlowRate, "3600", {
            from: owner
          });
          await app.transferFrom(owner, yannis, "0", {
            from: owner
          });
        });

        it("updates the streams", async () => {
          let flow = await sf.cfa.getFlow({
            superToken: daix.address,
            sender: app.address,
            receiver: owner
          });
          const newRate =
            flowRate.mul(toBN(inflowAccounts.length)) - nftFlowRate;
          assertBNEqual(flow.flowRate, newRate);
          flow = await sf.cfa.getFlow({
            superToken: daix.address,
            sender: app.address,
            receiver: yannis
          });
          assert.equal(flow.flowRate, nftFlowRate);
        });

        describe("When we fast forward into the future", () => {
          before("timeTravel", async () => {
            await timeTravelOnce(3600);
          });

          it("should increase the nft owner balance", async () => {
            assertBNEqual(await daix.balanceOf(app.address), "0");
            assertBNGreaterThan(await daix.balanceOf(yannis), "0");
          });
        });

        describe("the nft is transferred to a new account", () => {
          before("transfer NFT", async () => {
            await app.transferFrom(yannis, fran, "0", {
              from: yannis
            });
          });

          describe("When we fast forward into the future", () => {
            before("timeTravel", async () => {
              await timeTravelOnce(3600);
            });

            it("should increase the new nftOwner balance", async () => {
              assertBNEqual(await daix.balanceOf(app.address), "0");
              assertBNGreaterThan(await daix.balanceOf(fran), "0");
            });
          });
        });

        // describe('more NFTs are minted', () => {
        // 	const nftFlowRate = toWad(0.01);
        // 	before('mint & transfer NFT', async () => {
        // 		await app.createNFT(nftFlowRate, '3600', {
        // 			from: owner,
        // 		});
        // 		await app.createNFT(nftFlowRate, '3600', {
        // 			from: owner,
        // 		});
        // 		await app.transferFrom(owner, yannis, '1', {
        // 			from: owner,
        // 		});
        // 		await app.transferFrom(owner, fran, '2', {
        // 			from: owner,
        // 		});
        // 	});

        // 	it('update the streams', async () => {
        // 		const flow = await sf.cfa.getFlow({
        // 			superToken: daix.address,
        // 			sender: admin,
        // 			receiver: app.address,
        // 		});
        // 		assert.equal(flow.flowRate, flowRate);
        // 	});
        // });
      });
    });
  });
});
