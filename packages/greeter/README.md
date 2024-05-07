# Greeter tutorial (Stylus version)

`greeter` is a simple tutorial that showcases Arbitrum's L1-to-L2 message passing system (aka [retryable tickets](<(https://docs.arbitrum.io/how-arbitrum-works/arbos/l1-l2-messaging)>)).

It deploys 2 contracts: one, written in Solidity, to L1; and another, written in Rust, to L2. It then has the L1 contract send a message to the L2 contract to be executed automatically.

The script and contracts demonstrate how to interact with Arbitrum's core bridge contracts to create retryable messages, how to calculate and forward appropriate fees from L1 to L2, and how to use Arbitrum's L1-to-L2 message [address aliasing](https://docs.arbitrum.io/how-arbitrum-works/arbos/l1-l2-messaging#address-aliasing).

See [exec.js](./scripts/exec.js) for inline explanations.

## Environment Variables

Set the values shown in `.env-sample` as environmental variables. To copy it into a `.env` file:

```bash
cp .env-sample .env
```

Note that you can also use an .env file at the root of the repository.

After creating the .env file, you'll need to edit some variables like `PRIVATE_KEY`.

## Run tutorial

```
yarn run greeter
```
