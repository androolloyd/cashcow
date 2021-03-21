/* eslint-disable jsx-a11y/accessible-emoji */

import React, { useCallback, useEffect, useState } from "react";
import { Row, Col, Button, List, Divider, Input, Card, DatePicker, Slider, Switch, Progress, Spin } from "antd";
import { Address, Balance, EtherInput } from "../components";
import { parseEther, formatEther } from "@ethersproject/units";
import Web3Modal from "web3modal";
import WalletConnectProvider from "@walletconnect/web3-provider";
import { INFURA_ID } from "../constants";
import { Web3Provider } from "@ethersproject/providers";
import { ContractFactory } from "@ethersproject/contracts";

const contractName = "TradableCashFlow";
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

export default function SuperApp({
  account,
  superUser,
  superFluidHost,
  userDetails,
  address,
  mainnetProvider,
  userProvider,
  localProvider,
  yourLocalBalance,
  price,
  tx,
  readContracts,
  writeContracts,
}) {
  const [flowRate, setFlowRate] = useState(0);
  const [duration, setDuration] = useState(0);

  return (
    <Row justify={"space-between"}>
      {/*
        ⚙️ Here is an example UI that displays and sets the purpose in your smart contract:
      */}
      <Col order={3} style={{ border: "1px solid #cccccc", padding: 32, width: 400, margin: "auto", marginTop: 64 }}>
        {!superUser && <h2>Your not a super user yet, Connect wallet to get started</h2>}
        {superUser && <p>Hello Cashcow'er!!, Use the form below to tokenize your 🥛</p>}
        <Divider />
        {address && userProvider && (
          <>
            <div style={{ margin: 8 }}>
              <EtherInput
                placeholder={"flow rate"}
                onChange={value => {
                  setFlowRate(value);
                }}
              />
              <EtherInput
                placeholder={"duration"}
                onChange={value => {
                  setDuration(value);
                }}
              />
              <Button
                onClick={async () => {
                  await tx(writeContracts.TradeableCashflow.createNFT(flowRate, duration));
                }}
              >
                Create Token Tranche
              </Button>

              <Divider />
            </div>
          </>
        )}
      </Col>

      <Col order={2} style={{ width: 600, margin: "auto", marginTop: 32, paddingBottom: 32 }}>
        <h2>In Flows:</h2>

        {userDetails && userDetails.cfa && userDetails.cfa.flows && (
          <List
            bordered
            dataSource={userDetails.cfa.flows.inFlows}
            renderItem={(item, i) => {
              return (
                <List.Item key={i}>
                  <>
                    Sender: {item.sender} Receiver: {item.receiver} netFlow: {item.flowRate}
                  </>
                </List.Item>
              );
            }}
          />
        )}
        <Divider />
        <h2>Out Flows:</h2>

        {userDetails && userDetails.cfa && userDetails.cfa.flows && (
          <List
            bordered
            dataSource={userDetails.cfa.flows.outFlows}
            renderItem={(item, i) => {
              return (
                <List.Item key={i}>
                  <>
                    Sender: {item.sender} Receiver: {item.receiver} netFlow: {item.flowRate}
                  </>
                </List.Item>
              );
            }}
          />
        )}
      </Col>

      <Col order={1} style={{ width: 600, margin: "auto", marginTop: 32, paddingBottom: 256 }}>
        <Card>
          <h2>Your Flow Details: </h2>
          <ul>
            <li>Netflow: {userDetails && userDetails.cfa && userDetails.cfa.netFlow}</li>
          </ul>
        </Card>

        <Card style={{ marginTop: 32 }}>{account}</Card>
      </Col>
    </Row>
  );
}
