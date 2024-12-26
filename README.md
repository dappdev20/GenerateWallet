1. Project Description.
    - Generate 30 wallets in Solana.
    - Send tokens in 30 wallets to the main wallet and sell at once.
2. Project config
    - node version: nvm 18
    - .env
        tokenAddress=2VJrcBx3LSjVpvwi5tQKfNV5EczPdffAiQYAjUcZpump
        mainWalletPublic=ARukH4ZNtokuB1i2VR7LHk9NF3afT1sg4sCvgGMz6b4j
        mainWalletPrivate=
        SOLANA_RPC_URL=https://fluent-side-isle.solana-mainnet.quiknode.pro/apikey...
        SOLANA_WSS_URL=wss://fluent-side-isle.solana-mainnet.quiknode.pro/apikey...
        JITO_BUNDLE_TIP=0.0001
3. Project Build
    - npm install
    - Generate 30 wallets
        npm run generate
        if you run this command, you can see keys.json and 30 wallet addresses(pubkey, prvkey) are stored in that file.
    - Send token and sell
        npm run sell

If you have something to ask please contact me.
https://t.me/dappdev2002
