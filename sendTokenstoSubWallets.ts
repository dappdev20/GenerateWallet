import dotenv from "dotenv";
import BN from "bn.js";
import bs58 from 'bs58';
import {
    Keypair,
    PublicKey,
    Connection,
    LAMPORTS_PER_SOL,
    Transaction,
    SystemProgram
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    getMint,
    getAccount,
    getAssociatedTokenAddressSync,
    getOrCreateAssociatedTokenAccount,
    createAssociatedTokenAccountInstruction,
    transfer
} from "@solana/spl-token";
import {
    Token,
    SPL_ACCOUNT_LAYOUT,
} from "@raydium-io/raydium-sdk";
import { readFileSync, writeFileSync } from 'fs';
import * as SolanaLib from './solana';

dotenv.config();

export const networkName = process.env.SOLANA_RPC_URL || "mainnet";
console.log("RPC:", networkName);
export const connection = new Connection(networkName, "finalized");

export const getTokenBalance = async (connection, tokenAddress, walletAddress, lamports) => {
    const mint = new PublicKey(tokenAddress);
    const mintInfo = await getMint(connection, mint);
    const baseToken = new Token(TOKEN_PROGRAM_ID, tokenAddress, mintInfo.decimals);
    const walletTokenAccounts = await getWalletTokenAccount(connection, new PublicKey(walletAddress));
    let tokenBalance = 0;
    if (walletTokenAccounts && walletTokenAccounts.length > 0) {
        for (let walletTokenAccount of walletTokenAccounts) {
            if (walletTokenAccount.accountInfo.mint.toBase58() === tokenAddress) {
                if (lamports === true)
                    tokenBalance = Number(walletTokenAccount.accountInfo.amount);
                else
                    tokenBalance = Number(walletTokenAccount.accountInfo.amount) / 10 ** baseToken.decimals;
                break;
            }
        }

    }
    return tokenBalance;
}

export const getWalletTokenAccount = async (connection, wallet) => {
    const walletTokenAccount = await connection.getTokenAccountsByOwner(wallet, {
        programId: TOKEN_PROGRAM_ID,
    });
    return walletTokenAccount.value.map((i) => ({
        pubkey: i.pubkey,
        programId: i.account.owner,
        accountInfo: SPL_ACCOUNT_LAYOUT.decode(i.account.data),
    }));
};

export const sendTokenstoSubWallets = async () => {
    try {
        const keyFile = `keys.json`;
        console.log('Reading 30 Wallets...');
        // Read the file contents
        const keypairData = readFileSync(keyFile, 'utf8');
        // Parse the JSON content into an array
        const keyArray = JSON.parse(keypairData);
        console.log('Successfully read wallets...', keyArray.length);

        const receiverAddress = process.env.mainWalletPublic;
        const mintAddress = process.env.tokenAddress;
        const sender = Keypair.fromSecretKey(bs58.decode(keyArray[0].private_key));
        // Get Token Balance in each wallet
        for (let i = 0; i < keyArray.length; i++) {
            const public_key = keyArray[i].public_key;
            const private_key = keyArray[i].private_key;
            const receiver = Keypair.fromSecretKey(bs58.decode(private_key));
            console.log(`${i}th public key...`, public_key, mintAddress);
            const tokenBalance = await getTokenBalance(connection, mintAddress, public_key, true);
            console.log('token balance in wallet = ', tokenBalance);
            // if (tokenBalance > 0) 
                {
                // Step 1: Get or create the sender's associated token account
                const senderTokenAccount = await getOrCreateAssociatedTokenAccount(
                    connection,
                    sender, // Payer
                    new PublicKey(mintAddress), // Mint
                    sender.publicKey // Owner
                );

                console.log('Sender Token Account:', senderTokenAccount.address.toBase58());

                // Step 2: Get or create the receiver's associated token account
                const receiverTokenAccount = await getOrCreateAssociatedTokenAccount(
                    connection,
                    sender, // Payer
                    new PublicKey(mintAddress), // Mint
                    new PublicKey(receiver.publicKey) // Owner
                );

                console.log('Receiver Token Account:', receiverTokenAccount.address.toBase58());

                // Step 3: Create and add transfer instruction
                // const transaction = new Transaction().add(
                await transfer(
                    connection,
                    sender,
                    senderTokenAccount.address, // Source account
                    receiverTokenAccount.address, // Destination account
                    sender.publicKey, // Owner of source account
                    100000000000 // Amount to transfer (e.g., 1 token = 1000000 for 6 decimals)
                )
            }
        }

        // const sellTokenBalance = await getTokenBalance(connection, mintAddress, receiverAddress, true);
        // swapResult = await SolanaLib.pumpfun_sell(SolanaLib.CONNECTION, process.env.mainWalletPrivate, mintAddress, sellTokenBalance, Math.round(process.env.JITO_BUNDLE_TIP * SolanaLib.LAMPORTS));
        // if (swapResult && swapResult.success)
        //     console.log('Successfully sold all tokens!!!');

    } catch (e) {
        console.log('Sell Token error: ', e);
    }

};

sendTokenstoSubWallets();