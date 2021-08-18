const bootstrap = require("../helpers/contract/bootstrap");
const assert = require("assert");

const path = require("path");
const targz = require("targz");
const rimraf = require("rimraf");
const ContractKit = require("@celo/contractkit");

const cGLD = "0xaa86dda78e9434aca114b6676fc742a18d15a1cc";
const cUSD = "0x10a736a7b223f1fe1050264249d1abb975741e75";
const amount = "999999567453463472346";
const gasPrice = 12345678901;

describe("Transaction rejection", function() {
  let context;
  let kit;
  let goldtoken;
  let stabletoken;

  before("Setting up web3 and contract", async function() {
    this.timeout(17500);

    const contractRef = {
      contractFiles: ["EstimateGas"],
      contractSubdirectory: "gas"
    };

    await decompressChain(path.join(__dirname, "../../devchain.tar.gz"), path.join(__dirname, "/devchain"));

    const ganacheProviderOptions = {
      // important: we want to make sure we get tx rejections as rpc errors even
      // if we don't want runtime errors as RPC erros
      vmErrorsOnRPCResponse: false,
      gasLimit: 0x1312d00f,
      mnemonic: "concert load couple harbor equip island argue ramp clarify fence smart topic",
      db_path: path.join(__dirname, "/devchain")
    };

    context = await bootstrap(contractRef, ganacheProviderOptions);
    kit = ContractKit.newKitFromWeb3(context.web3);
    goldtoken = await kit.contracts.getGoldToken();
    stabletoken = await kit.contracts.getStableToken();
  });

  before("lock account 1", async function() {
    const { accounts, web3 } = context;
    await web3.eth.personal.lockAccount(accounts[1]);
  });

  after(function() {
    console.log("Removing devchain folder");
    rimraf.sync(path.join(__dirname, "/devchain"));
  });

  it("should reject transaction if nonce is incorrect", async function() {
    await testTransactionForRejection(
      {
        nonce: 0xffff
      },
      "the tx doesn't have the correct nonce"
    );
  });

  it("should reject transaction if from account is missing", async function() {
    await testTransactionForRejection(
      {
        from: undefined
      },
      "from not found; is required"
    );
  });

  it("should reject transaction if from account is invalid/unknown", async function() {
    await testTransactionForRejection(
      {
        from: "0x0000000000000000000000000000000000000001"
      },
      "sender account not recognized"
    );
  });

  it("should reject transaction if from known account which is locked", async function() {
    const { accounts } = context;
    await testTransactionForRejection(
      {
        from: accounts[1]
      },
      "signer account is locked"
    );
  });

  it("should reject transaction if gas limit exceeds block gas limit", async function() {
    await testTransactionForRejection(
      {
        gas: 0xffffffff
      },
      "Exceeds block gas limit"
    );
  });

  it("should reject transaction if insufficient funds", async function() {
    const { web3 } = context;
    await testTransactionForRejection(
      {
        value: web3.utils.toWei("1000000000000", "ether")
      },
      "sender doesn't have enough funds to send tx"
    );
  });

  it("should correctly send cGLD and deduce cGLD as fee currency", async function() {
    const { accounts } = context;
    const cGLDBalance1 = await goldtoken.balanceOf(accounts[0]);
    const cUSDBalance1 = await stabletoken.balanceOf(accounts[0]);

    const celotx = await goldtoken.transfer(accounts[1], amount).send({ from: accounts[0], gasPrice });
    const celoReceipt = await celotx.waitReceipt();

    const cGLDBalance2 = await goldtoken.balanceOf(accounts[0]);
    const cUSDBalance2 = await stabletoken.balanceOf(accounts[0]);

    testDeduction(
      { [cGLD]: cGLDBalance1, [cUSD]: cUSDBalance1 },
      { [cGLD]: cGLDBalance2, [cUSD]: cUSDBalance2 },
      cGLD,
      cGLD,
      celoReceipt
    );
  });

  it("should correctly send cUSD and deduce cGLD as fee currency", async function() {
    const { accounts } = context;
    const cGLDBalance1 = await goldtoken.balanceOf(accounts[0]);
    const cUSDBalance1 = await stabletoken.balanceOf(accounts[0]);

    const celotx = await stabletoken.transfer(accounts[1], amount).send({ from: accounts[0], gasPrice });
    const celoReceipt = await celotx.waitReceipt();

    const cGLDBalance2 = await goldtoken.balanceOf(accounts[0]);
    const cUSDBalance2 = await stabletoken.balanceOf(accounts[0]);

    testDeduction(
      { [cGLD]: cGLDBalance1, [cUSD]: cUSDBalance1 },
      { [cGLD]: cGLDBalance2, [cUSD]: cUSDBalance2 },
      cUSD,
      cGLD,
      celoReceipt
    );
  });

  it("should correctly send cGLD and deduce cUSD as fee currency", async function() {
    this.timeout(7000); // Because TX's with fee currency take longer to execute
    const { accounts } = context;
    const cGLDBalance1 = await goldtoken.balanceOf(accounts[0]);
    const cUSDBalance1 = await stabletoken.balanceOf(accounts[0]);

    const celotx = await goldtoken
      .transfer(accounts[1], amount)
      .send({ from: accounts[0], feeCurrency: cUSD, gasPrice });
    const celoReceipt = await celotx.waitReceipt();

    const cGLDBalance2 = await goldtoken.balanceOf(accounts[0]);
    const cUSDBalance2 = await stabletoken.balanceOf(accounts[0]);

    testDeduction(
      { [cGLD]: cGLDBalance1, [cUSD]: cUSDBalance1 },
      { [cGLD]: cGLDBalance2, [cUSD]: cUSDBalance2 },
      cGLD,
      cUSD,
      celoReceipt
    );
  });

  it("should correctly send cUSD and deduce cUSD as fee currency", async function() {
    this.timeout(7000); // Because TX's with fee currency take longer to execute
    const { accounts } = context;
    const cGLDBalance1 = await goldtoken.balanceOf(accounts[0]);
    const cUSDBalance1 = await stabletoken.balanceOf(accounts[0]);

    const celotx = await stabletoken
      .transfer(accounts[1], amount)
      .send({ from: accounts[0], feeCurrency: cUSD, gasPrice });
    const celoReceipt = await celotx.waitReceipt();

    const cGLDBalance2 = await goldtoken.balanceOf(accounts[0]);
    const cUSDBalance2 = await stabletoken.balanceOf(accounts[0]);

    testDeduction(
      { [cGLD]: cGLDBalance1, [cUSD]: cUSDBalance1 },
      { [cGLD]: cGLDBalance2, [cUSD]: cUSDBalance2 },
      cUSD,
      cUSD,
      celoReceipt
    );
  });

  let counter = 1;
  async function testTransactionForRejection(paramsOverride, expectedMessage) {
    const { accounts, instance, provider, web3 } = context;
    // this is a special `send` fn that doesn't reject and ignores the callback `error` param
    const send = async(method, ...params) =>
      new Promise((resolve) =>
        provider.send(
          {
            id: counter++,
            jsonrpc: "2.0",
            method,
            params: [...params]
            // we ignore the error because we just want to check the response obj for these tests
          },
          (_err, response) => resolve(response)
        )
      );

    const params = Object.assign(
      {
        from: accounts[0],
        to: instance.options.address,
        data:
          "0x91ea8a0554696d0000000000000000000000000000000000000000000000000" +
          "00000000041206772656174206775790000000000000000000000000000000000" +
          "000000000000000000000000000000000000000000000000000000000000000000000005"
      },
      paramsOverride
    );

    // don't send with web3 because it'll inject its own checks
    const response = await send("eth_sendTransaction", params).catch((e) => ({ error: e }));

    if (response.error) {
      if (response.error.message) {
        assert(
          response.error.message.startsWith(expectedMessage),
          `Expected error message matching ${expectedMessage}, got ${response.error.message}`
        );
      } else {
        assert.fail(new Error("Error was returned which had no message"));
      }
    } else if (response.result) {
      const receipt = await web3.eth.getTransactionReceipt(response.result);
      if (!receipt.status) {
        assert.fail(new Error("TX rejections should return error, but returned receipt with falsey status instead"));
      } else {
        assert.fail(
          new Error(
            `TX should have rejected prior to running. Instead transaction ran successfully (receipt.status == 
              ${receipt.status})`
          )
        );
      }
    } else {
      assert.fail(new Error("eth_sendTransaction responded with empty RPC response"));
    }
  }

  function testDeduction(balanceBefore, balanceAfter, valueCurrency, feeCurrency, receipt) {
    if (!receipt) {
      assert.fail(new Error("TX doesn't have a receipt."));
    }

    if (!receipt.status) {
      assert.fail(
        new Error(`TX should have run successfully. Instead transaction failed (receipt.status ==
        ${receipt.status})`)
      );
    }

    if (valueCurrency === feeCurrency) {
      assert.strictEqual(
        balanceAfter[valueCurrency].toNumber(),
        balanceBefore[valueCurrency]
          .minus(amount)
          .minus(receipt.gasUsed * gasPrice)
          .toNumber()
      );
    } else if (valueCurrency === cGLD && feeCurrency === cUSD) {
      assert.strictEqual(balanceAfter[valueCurrency].toNumber(), balanceBefore[valueCurrency].minus(amount).toNumber());
      assert.strictEqual(
        balanceAfter[feeCurrency].toNumber(),
        balanceBefore[feeCurrency].minus(receipt.gasUsed * gasPrice).toNumber()
      );
    }
  }

  function decompressChain(tarPath, copyChainPath) {
    return new Promise((resolve, reject) => {
      targz.decompress({ src: tarPath, dest: copyChainPath }, (err) => {
        if (err) {
          console.error(err);
          reject(err);
        } else {
          console.log("Chain decompressed");
          resolve();
        }
      });
    });
  }
});
