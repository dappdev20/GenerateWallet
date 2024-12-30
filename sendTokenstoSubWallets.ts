import dotenv from "dotenv";
import BN from "bn.js";
import bs58 from 'bs58';
import {
    Keypair,
    PublicKey,
    Connection,
    LAMPORTS_PER_SOL,
    Transaction,
    SystemProgram,
    TransactionMessage,
    TransactionInstruction,
    VersionedTransaction,
    AddressLookupTableProgram,
    AddressLookupTableAccount
} from "@solana/web3.js";
import {
    TOKEN_PROGRAM_ID,
    getMint,
    getAccount,
    getAssociatedTokenAddressSync,
    getOrCreateAssociatedTokenAccount,
    createAssociatedTokenAccountInstruction,
    transfer,
    createTransferInstruction,
    ASSOCIATED_TOKEN_PROGRAM_ID,
    getAssociatedTokenAddress
} from "@solana/spl-token";
import {
    Token,
    SPL_ACCOUNT_LAYOUT,
    _10000,
} from "@raydium-io/raydium-sdk";
import { readFileSync, writeFileSync } from 'fs';
import * as SolanaLib from './solana';
import axios from "axios";
import { AnchorProvider, Program, web3, Wallet } from '@project-serum/anchor';
import { IDL } from './IDL';
import { Idl } from "@coral-xyz/anchor";

dotenv.config();

const MINT_AUTHORITY = "TSLvdd1pWpHVjahSpsvCXUbgwsL3JAcvokwaKt1eokM";
const TOKEN_PROGRAM = "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA";
const GLOBAL_ACCOUNT = "4wTV1YmiEkRvAtNtsSGPtUrqRYQMe5SKy2uB4Jjaxnjf";
const FEE_RECIPIENT = "CebN5WGQ4jvEPvsVU4EoHEpgzq1VV7AbicfhtW4xC9iM";
const EVENT_AUTHORITY = "Ce6TQqeHC9p8KetsN6JsjHK7UTZk7nasjjnr7XxXp9F1";
const SYSTEM_PROGRAM = "11111111111111111111111111111111";
const SYSTEM_RENT = "SysvarRent111111111111111111111111111111111";
const MPL_TOKEN_METADATA = "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s";

const mintAuthority = new PublicKey(MINT_AUTHORITY);
const tokenProgram = new PublicKey(TOKEN_PROGRAM);
const globalAccount = new PublicKey(GLOBAL_ACCOUNT);
const feeRecipient = new PublicKey(FEE_RECIPIENT);
const eventAuthority = new PublicKey(EVENT_AUTHORITY);
const systemProgram = new PublicKey(SYSTEM_PROGRAM);
const rent = new PublicKey(SYSTEM_RENT);
const mplTokenMetadata = new PublicKey(MPL_TOKEN_METADATA);

let totalTokenAmount: number = 0;

const chunkArray = async (array: any[], chunkSize: number) => {
    const chunks: any[] = []; // This is an array of arrays
    for (let i = 0; i < array.length; i += chunkSize) {
        chunks.push(array.slice(i, i + chunkSize));
    }
    return chunks;
};

export const networkName = process.env.SOLANA_RPC_URL || "mainnet";
console.log("RPC:", networkName);
export const connection = new Connection(networkName, "confirmed");

export const sleep = (ms: any) => new Promise((r) => setTimeout(r, ms));

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

export const createTokenAccountTx = async (
    connection: Connection,
    mainWallet: Keypair,
    addressList: PublicKey[]
) => {
    const instructions: TransactionInstruction[] = [];
    const slot = await connection.getSlot();

    const [lookupTableInst, lookupTableAddress] =
        AddressLookupTableProgram.createLookupTable({
            authority: mainWallet.publicKey,
            payer: mainWallet.publicKey,
            recentSlot: slot,
        });

    const extendInstruction = AddressLookupTableProgram.extendLookupTable({
        payer: mainWallet.publicKey,
        authority: mainWallet.publicKey,
        lookupTable: lookupTableAddress,
        addresses: addressList.map(item => new PublicKey(item)),
    });

    instructions.push(lookupTableInst);
    instructions.push(extendInstruction);

    const tx = await makeVersionedTransactions(connection, mainWallet, instructions);

    await createAndSendBundleEx(connection, mainWallet, [tx]);

    return lookupTableAddress;
}

export const makeVersionedTransactions = async (connection: Connection, signer: Keypair, instructions: TransactionInstruction[]) => {
    let latestBlockhash = await connection.getLatestBlockhash();
    const messageV0 = new TransactionMessage({
        payerKey: signer.publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: instructions,
    }).compileToV0Message();

    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign([signer]);
    return versionedTransaction;
};

export const makeVersionedTransactionsWithMultiSign = async (
    connection: Connection,
    signer: Keypair[],
    instructions: TransactionInstruction[],
    addressLookupTable: string = ''
) => {
    let latestBlockhash = await connection.getLatestBlockhash();

    const addressLookupTableAccountList: AddressLookupTableAccount[] = [];

    if (addressLookupTable != '') {
        const accountInfo = await connection.getAddressLookupTable(new PublicKey(addressLookupTable));

        if (accountInfo.value != null) {
            addressLookupTableAccountList.push(accountInfo.value);
        }
    }

    // CompPlease looiles and signs the transaction message with the sender's Keypair.
    const messageV0 = new TransactionMessage({
        payerKey: signer[1].publicKey,
        recentBlockhash: latestBlockhash.blockhash,
        instructions: instructions,
    }).compileToV0Message(addressLookupTableAccountList);

    const versionedTransaction = new VersionedTransaction(messageV0);
    versionedTransaction.sign(signer);
    return versionedTransaction;
};

export const createAndSendBundleEx = async (connection: Connection, payer: Keypair, bundleTransactions: VersionedTransaction[]) => {
    try {

        const tipTx = await getTipVesionedTransaction(connection, payer.publicKey, Number(process.env.JITO_BUNDLE_TIP));

        if (!tipTx) {
            return false;
        }

        tipTx.sign([payer]);

        bundleTransactions.push(tipTx);

        const rawTxns = bundleTransactions.map(item => bs58.encode(item.serialize()));

        const { data: bundleRes } = await axios.post(`https://slc.mainnet.block-engine.jito.wtf/api/v1/bundles`,
            {
                jsonrpc: "2.0",
                id: 1,
                method: "sendBundle",
                params: [
                    rawTxns
                ],
            },
            {
                headers: {
                    "Content-Type": "application/json",
                },
            }
        );

        if (!bundleRes) {
            return false;
        }

        const bundleUUID = bundleRes.result;
        console.log("Bundle sent.");
        console.log("Bundle UUID:", bundleUUID);

        const res = await checkBundle(connection, bundleUUID, bundleTransactions);

        return res;
    } catch (error) {
        console.error("Error creating and sending bundle.", error);
    }
    return false;
};

const checkBundle = async (connection: Connection, uuid: any, bundleTransactions: VersionedTransaction[]) => {
    let count = 0;
    while (1) {
        try {
            const response = await (
                await fetch(`https://slc.mainnet.block-engine.jito.wtf/api/v1/bundles`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        jsonrpc: '2.0',
                        id: 1,
                        method: 'getBundleStatuses',
                        params: [[uuid]]
                    })
                })
            ).json();

            // console.log("response", response.result.value.length);
            // console.log("bundle_id", response.result.value[0].bundle_id);
            const trxHash = bs58.encode(bundleTransactions[bundleTransactions.length - 1].signatures[0])
            console.log('Bundle signature = ', trxHash);
            const sigResult = await connection.getSignatureStatus(trxHash, {
                searchTransactionHistory: true,
            });
            if (response?.result?.value?.length == 1 && response?.result?.value[0]?.bundle_id && sigResult.value?.confirmationStatus) {
                console.log('Bundle Success:', uuid);
                return true;
            }

        } catch (error) {
            console.log('Check Bundle Failed', error);
        }

        await sleep(1000);
        count++;

        if (count == 30) {
            console.log('Bundle Failed:', uuid);
            return false;
        }
    }
    return false;
}

export async function getTipVesionedTransaction(
    connection: Connection,
    ownerPubkey: PublicKey,
    tip: number
) {
    const instruction = await getTipInstruction(ownerPubkey, tip);

    if (!instruction) {
        return null;
    }

    const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;
    const messageV0 = new TransactionMessage({
        payerKey: ownerPubkey,
        recentBlockhash: recentBlockhash,
        instructions: [instruction]
    }).compileToV0Message();

    return new VersionedTransaction(messageV0);
}

export async function getTipInstruction(
    ownerPubkey: PublicKey,
    tip: number
) {
    try {
        console.log("Adding tip transactions...", tip);

        const tipAccount = await getJitoTipAccount();
        const instruction =
            SystemProgram.transfer({
                fromPubkey: ownerPubkey,
                toPubkey: tipAccount,
                lamports: LAMPORTS_PER_SOL * tip,
            })

        return instruction;
    }
    catch (err) {
        console.log(err);
    }
    return null;
}

export const getJitoTipAccount = () => {
    const tipAccounts = [
        '96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5',
        'HFqU5x63VTqvQss8hp11i4wVV8bD44PvwucfZ2bU7gRe',
        'Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY',
        'ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49',
        'DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWNDXjh',
        'ADuUkR4vqLUMWXxW9gh6D6L8pMSawimctcNZ5pGwDcEt',
        'DttWaMuVvTiduZRnguLF7jNxTgiMBZ1hyAumKUiL2KRL',
        '3AVi9Tg9Uo68tJfuvoKvqKNWKkC5wPdSSdeBnizKZ6jT',
    ];
    // Randomly select one of the tip addresses
    const selectedTipAccount = tipAccounts[Math.floor(Math.random() * tipAccounts.length)];
    return new PublicKey(selectedTipAccount);
};

export const transferTokensToSubWallets = async (tokenAddress: string, mainWallet: Keypair, buyerWallets: Keypair[], lut: any) => {
    const tokenMint = new PublicKey(tokenAddress);
    const mainWalletPublicKey = new PublicKey(mainWallet.publicKey);

    const chunkSize = 6;
    const buyerWalletChunks = await chunkArray(buyerWallets, chunkSize);
    const bundleTrxs: VersionedTransaction[] = [];

    const lookupTableAccount = (
        await connection.getAddressLookupTable(lut)
    ).value;

    console.log(`lut: ${JSON.stringify(lut)}`);
    totalTokenAmount = 0;
    for (let chunkIndex = 0; chunkIndex < buyerWalletChunks.length; chunkIndex++) {
        let chunkWallets: Keypair[] = [];
        let chunkInstructions: TransactionInstruction[] = [];
        let chunkSigners: Keypair[] = [];
        chunkWallets.push(...buyerWalletChunks[chunkIndex]);

        for (let i = 0; i < chunkWallets.length; i++) {
            const wallet = chunkWallets[i];
            try {
                const receiverATA = await getAssociatedTokenAddress(tokenMint, wallet.publicKey, false, TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID);
                const recATA = await connection.getTokenAccountsByOwner(wallet.publicKey, { mint: tokenMint });
                if (recATA.value.length === 0) {
                    console.log('Creating token account for main wallet.');
                    const createTokenAccountInst = createAssociatedTokenAccountInstruction(
                        wallet.publicKey,
                        receiverATA,
                        mainWalletPublicKey,
                        tokenMint,
                        TOKEN_PROGRAM_ID,
                        ASSOCIATED_TOKEN_PROGRAM_ID
                    );
                    chunkInstructions.push(createTokenAccountInst);
                }
                const owner = mainWallet.publicKey;
                const tokenAccount = await connection.getTokenAccountsByOwner(owner, { mint: tokenMint });
                if (tokenAccount.value.length === 0) {
                    console.error('No token account found for this wallet, skipping.');
                    continue;
                }

                const tokenAccountPubkey = tokenAccount.value[0].pubkey;
                let sendAmountLamports: Number = Number(process.env.distributeTokenAmount) * LAMPORTS_PER_SOL / 1000;

                if (Number(sendAmountLamports) > 0) {
                    const instruction = createTransferInstruction(
                        tokenAccountPubkey,
                        receiverATA,
                        owner,
                        Number(sendAmountLamports),
                        [],
                        TOKEN_PROGRAM_ID
                    );
                    chunkInstructions.push(instruction);
                    chunkSigners.push(mainWallet);
                } else {
                    console.error(`Wallet${chunkIndex * chunkSize + i} Token balance too low, skipping.`);
                }
            } catch (error) {
                console.error(`Error processing wallet ${wallet.publicKey.toString()}:`, error);
            }
        }

        if (chunkInstructions.length === 0) {
            console.error('No valid transfer instructions found.');
            continue;
        }
        const latestBlockhash = await connection.getLatestBlockhash();
        const transaction = new VersionedTransaction(new TransactionMessage({
            payerKey: chunkSigners[0].publicKey,
            recentBlockhash: latestBlockhash.blockhash,
            instructions: chunkInstructions,
        }).compileToV0Message(lookupTableAccount ? [lookupTableAccount] : []));

        transaction.sign(chunkSigners);
        bundleTrxs.push(transaction);
    }
    const confirmed = await createAndSendBundleEx(connection, buyerWallets[0], bundleTrxs);
    return confirmed;
}

export const getBondingCurve = async (tokenMint: PublicKey, programId: PublicKey): Promise<PublicKey> => {
    try {
        const seedString = "bonding-curve";
        const [PDA] = PublicKey.findProgramAddressSync([Buffer.from(seedString), tokenMint.toBuffer()], programId);
        return PDA;
    } catch (error) {
        console.log(`An error occurred in getBondingCurve: ${error}`);
        throw error;
    }
}

export const sellPumpfunToken = async (connection: Connection, walletKeypair: Keypair, tokenMint: PublicKey, amount: number, minSolOutput: number) => {
    try {
        const amountBN = new BN(amount);
        const minSolOutputBN = new BN(minSolOutput * LAMPORTS_PER_SOL);
        const provider = new AnchorProvider(connection, new Wallet(walletKeypair), { preflightCommitment: 'processed' });
        const program = new Program(IDL as any, IDL.metadata.address, provider);
        const bondingCurve = await getBondingCurve(tokenMint, program.programId);
        const associatedBondingCurve = await getAssociatedTokenAddress(tokenMint, bondingCurve, true, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
        const associatedToken = await getAssociatedTokenAddress(tokenMint, walletKeypair.publicKey, false, tokenProgram, ASSOCIATED_TOKEN_PROGRAM_ID);
        const instructions: TransactionInstruction[] = [
            program.instruction.sell(amountBN, minSolOutputBN, {
                accounts: {
                    global: globalAccount,
                    feeRecipient,
                    mint: tokenMint,
                    bondingCurve,
                    associatedBondingCurve,
                    associatedUser: associatedToken,
                    user: walletKeypair.publicKey,
                    systemProgram,
                    associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
                    tokenProgram,
                    eventAuthority,
                    program: program.programId
                }
            })
        ];
        return instructions;
    } catch (error) {
        console.log(`An error occurred during make instructions for selling token. ${error}`);
        return null;
    }
}

export const sellTokens = async () => {
    try {
        const keyFile = `keys.json`;
        console.log('Reading 30 Wallets...');
        // Read the file contents
        const keypairData = readFileSync(keyFile, 'utf8');
        // Parse the JSON content into an array
        const keyArray = JSON.parse(keypairData);
        console.log('Successfully read wallets...', keyArray.length);

        const mintAddress: string = process.env.tokenAddress || "";
        const mainWallet: Keypair = Keypair.fromSecretKey(bs58.decode(keyArray[0].private_key as string));
        let subWallets: Keypair[] = [];
        let pubKeys: PublicKey[] = [];
        // Get Token Balance in each wallet
        for (let i = 1; i < keyArray.length; i++) {
            const private_key = keyArray[i].private_key;
            const sender = Keypair.fromSecretKey(bs58.decode(private_key));
            subWallets.push(sender);
            pubKeys.push(sender.publicKey);
        }
        const lookupTableAddress = await createTokenAccountTx(
            connection,
            mainWallet,
            pubKeys
        );

        // const lookupTableAddress = new PublicKey("EDrnpU1isYYSnLsANkuXtMBdMhtFrihvE1U6qC7h9DWe")

        const confirmed = await transferTokensToSubWallets(mintAddress, mainWallet, subWallets, lookupTableAddress);
        console.log('Successfully transferred tokens...');
    } catch (e) {
        console.log('Sell Token error: ', e);
    }

};

sellTokens();