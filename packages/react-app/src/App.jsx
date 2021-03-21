import React, { useCallback, useEffect, useState } from "react";
import { BrowserRouter, Switch, Route, Link } from "react-router-dom";
import "antd/dist/antd.css";
import { JsonRpcProvider, Web3Provider } from "@ethersproject/providers";
import "./App.css";
import { Row, Col, Button, Menu, Alert, Switch as SwitchD } from "antd";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";
import { useUserAddress } from "eth-hooks";
import { formatEther, parseEther } from "@ethersproject/units";
import { useThemeSwitcher } from "react-css-theme-switcher";
import {
  useExchangePrice,
  useGasPrice,
  useUserProvider,
  useContractLoader,
  useContractReader,
  useEventListener,
  useBalance,
  useExternalContractLoader,
} from "./hooks";
import { Header, Account, Faucet, Ramp, Contract, GasGauge, ThemeSwitch } from "./components";
import { Transactor } from "./helpers";
// import Hints from "./Hints";
import { Hints, SuperApp, Subgraph } from "./views";
import { INFURA_ID, DAI_ADDRESS, DAI_ABI, NETWORK, NETWORKS } from "./constants";
/*
    Welcome to 🏗 scaffold-eth !

    Code:
    https://github.com/austintgriffith/scaffold-eth

    Support:
    https://t.me/joinchat/KByvmRe5wkR-8F_zz6AjpA
    or DM @austingriffith on twitter or telegram

    You should get your own Infura.io ID and put it in `constants.js`
    (this is your connection to the main Ethereum network for ENS etc.)


    🌏 EXTERNAL CONTRACTS:
    You can also bring in contract artifacts in `constants.js`
    (and then use the `useExternalContractLoader()` hook!)
*/

const SuperfluidSDK = require("@superfluid-finance/js-sdk");
/// 📡 What chain are your contracts deployed to?
const targetNetwork = NETWORKS.localhost; // <------- select your target frontend network (localhost, rinkeby, xdai, mainnet)

// 😬 Sorry for all the console logging
const DEBUG = true;

// 🛰 providers
if (DEBUG) console.log("📡 Connecting to Mainnet Ethereum");
// const mainnetProvider = getDefaultProvider("mainnet", { infura: INFURA_ID, etherscan: ETHERSCAN_KEY, quorum: 1 });
// const mainnetProvider = new InfuraProvider("mainnet",INFURA_ID);
//
// attempt to connect to our own scaffold eth rpc and if that fails fall back to infura...
const mainnetProviderConnection = new JsonRpcProvider("http://geth.dappnode:8545");
// ( ⚠️ Getting "failed to meet quorum" errors? Check your INFURA_I

// 🏠 Your local provider is usually pointed at your local blockchain
// as you deploy to other networks you can set REACT_APP_PROVIDER=https://dai.poa.network in packages/react-app/.env
// 🔭 block explorer URL
const blockExplorer = targetNetwork.blockExplorer;

function App(props) {
  // const mainnetProvider = mainnetProviderConnection;
  // if (DEBUG) console.log("🌎 mainnetProvider", mainnetProvider);

  const [injectedProvider, setInjectedProvider] = useState();
  /* 💵 This hook will get the price of ETH from 🦄 Uniswap: */
  // const price = useExchangePrice(targetNetwork, mainnetProvider);

  /* 🔥 This hook will get the price of Gas from ⛽️ EtherGasStation */
  const gasPrice = useGasPrice(targetNetwork, "fast");
  // Use your injected provider from 🦊 Metamask or if you don't have it then instantly generate a 🔥 burner wallet.
  const userProvider = useUserProvider(injectedProvider);
  const address = useUserAddress(userProvider);
  if (DEBUG) console.log("👩‍💼 selected address:", address);
  const mainnetProvider = userProvider;

  // You can warn the user if you would like them to be on a specific network

  // For more hooks, check out 🔗eth-hooks at: https://www.npmjs.com/package/eth-hooks

  // The transactor wraps transactions and provides notificiations
  const tx = Transactor(userProvider, gasPrice);

  // Just plug in different 🛰 providers to get your balance on different chains:
  const yourMainnetBalance = useBalance(mainnetProvider, address);
  if (DEBUG) console.log("💵 yourMainnetBalance", yourMainnetBalance ? formatEther(yourMainnetBalance) : "...");

  // Load in your local 📝 contract and read a value from it:
  const readContracts = useContractLoader(mainnetProvider);
  if (DEBUG) console.log("📝 readContracts", readContracts);

  // If you want to make 🔐 write transactions to your contracts, use the userProvider:
  const writeContracts = useContractLoader(userProvider);
  if (DEBUG) console.log("🔐 writeContracts", writeContracts);
  const yourLocalBalance = yourMainnetBalance;

  const [userDetails, setUserDetails] = useState({});
  const [superFluidHost, setSuperFluidHost] = useState({});
  const [superUser, setSuperUser] = useState({});
  // keep track of a variable from the contract in the local React state:
  // const purpose = useContractReader(readContracts, "YourContract", "purpose");
  // console.log("🤗 purpose:", purpose);

  // 📟 Listen for broadcast events
  // const setPurposeEvents = useEventListener(readContracts, "YourContract", "SetPurpose", localProvider, 1);
  // console.log("📟 SetPurpose events:", setPurposeEvents);

  /*
                    const addressFromENS = useResolveName(mainnetProvider, "austingriffith.eth");
                    console.log("🏷 Resolved austingriffith.eth as:",addressFromENS)
                    */

  let networkDisplay = (
    <div
      style={{
        zIndex: -1,
        position: "absolute",
        right: 154,
        top: 28,
        padding: 16,
        color: targetNetwork.color,
      }}
    >
      {targetNetwork.name}
    </div>
  );

  const loadWeb3Modal = useCallback(async () => {
    const provider = await web3Modal.connect();
    setInjectedProvider(new Web3Provider(provider));
  }, [setInjectedProvider]);

  useEffect(() => {
    if (address && userProvider && readContracts) {
      const sf = new SuperfluidSDK.Framework({
        ethers: userProvider,
      });
      sf.initialize()
        .then(() => {
          setSuperFluidHost(sf);
          const companyTranche = readContracts.TradeableCashflow.address;
          const user = sf.user({
            address: companyTranche,
            token: "0xF2d68898557cCb2Cf4C10c3Ef2B034b2a69DAD00",
          });
          setSuperFluidHost(user);
          return user;
        })
        .then(user => {
          return user.details();
        })
        .then(details => {
          setUserDetails(details);
        });
    }
  }, [address, userProvider, setUserDetails, setSuperFluidHost, setSuperUser, readContracts]);
  console.log(userDetails);
  useEffect(() => {
    if (web3Modal.cachedProvider) {
      loadWeb3Modal();
    }
  }, [loadWeb3Modal]);

  const [route, setRoute] = useState();
  useEffect(() => {
    setRoute(window.location.pathname);
  }, [setRoute]);

  return (
    <div className="App">
      {/* ✏️ Edit the header and change the title to your project name */}
      <Header />
      {networkDisplay}
      <BrowserRouter>
        <Menu style={{ textAlign: "center" }} selectedKeys={[route]} mode="horizontal">
          <Menu.Item key="/">
            <Link
              onClick={() => {
                setRoute("/");
              }}
              to="/"
            >
              NFT HACK
            </Link>
          </Menu.Item>
          <Menu.Item key="/">
            <a target={"_blank"} norel href={"https://github.com/i-stam/future-sale"}>
              Github
            </a>
          </Menu.Item>
        </Menu>
      </BrowserRouter>
      <SuperApp
        account={
          <Account
            address={address}
            userProvider={userProvider}
            mainnetProvider={mainnetProvider}
            web3Modal={web3Modal}
            loadWeb3Modal={loadWeb3Modal}
            logoutOfWeb3Modal={logoutOfWeb3Modal}
            blockExplorer={blockExplorer}
          />
        }
        superUser={superUser}
        superFluidHost={superFluidHost}
        userDetails={userDetails}
        yourLocalBalance={yourLocalBalance}
        address={address}
        userProvider={userProvider}
        mainnetProvider={mainnetProvider}
        tx={tx}
        writeContracts={writeContracts}
        readContracts={readContracts}
      />
      <ThemeSwitch />

      {/* 👨‍💼 Your account is in the top right with a wallet at connect options */}
      <div style={{ position: "fixed", textAlign: "right", right: 0, top: 0, padding: 10 }} />
    </div>
  );
}

/*
  Web3 modal helps us "connect" external wallets:
*/
const web3Modal = new Web3Modal({
  // network: "mainnet", // optional
  cacheProvider: true, // optional
  providerOptions: {
    walletconnect: {
      package: WalletConnectProvider, // required
      options: {
        infuraId: INFURA_ID,
      },
    },
  },
});

const logoutOfWeb3Modal = async () => {
  await web3Modal.clearCachedProvider();
  setTimeout(() => {
    window.location.reload();
  }, 1);
};

window.ethereum &&
  window.ethereum.on("chainChanged", chainId => {
    setTimeout(() => {
      window.location.reload();
    }, 1);
  });

export default App;
