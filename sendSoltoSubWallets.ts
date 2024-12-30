import dotenv from "dotenv";
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
} from "@solana/web3.js";
import { readFileSync } from 'fs';
import axios from "axios";
import { getTokenBalance, WSOL_ADDRESS } from "./solana";
dotenv.config();

export const networkName = process.env.SOLANA_RPC_URL || "mainnet";
console.log("RPC:", networkName);
export const connection = new Connection(networkName, "finalized");

export const sendSolsToSubWallets = async () => {
    const keyFile = `keys.json`;
    const keypairData = readFileSync(keyFile, 'utf8');
    const keyArray = JSON.parse(keypairData);
    console.log('Successfully read wallets...', keyArray.length);
    let mainWallet: Keypair = Keypair.fromSecretKey(bs58.decode(keyArray[0].private_key));;
    let subWallet: Keypair;
    let idx = 0;
    let ith = 1;
    try {
        while (idx < keyArray.length) {
            const instructions: TransactionInstruction[] = [];
            for (let i = idx; i < idx + 5; i++) {
                if (i >= keyArray.length) {
                    console.log('Exceeds wallet number :', i);
                    break;
                }
                    
                const public_key = keyArray[i].public_key;
                const private_key = keyArray[i].private_key;

                if (i === 0) {
                    mainWallet = Keypair.fromSecretKey(bs58.decode(private_key));
                    continue;
                } else {
                    subWallet = Keypair.fromSecretKey(bs58.decode(private_key));
                }

                const balance = await connection.getBalance(subWallet.publicKey);
                // if (balance < 0.002 * LAMPORTS_PER_SOL) {
                    instructions.push(
                        SystemProgram.transfer({
                            fromPubkey: mainWallet.publicKey,
                            toPubkey: subWallet.publicKey,
                            lamports: Number(process.env.distributeSolAmount) * LAMPORTS_PER_SOL,
                        })
                    );
                // }
            }

            if (instructions.length > 0) {
                console.log(`Distributing ${ith}th group wallets`);
                const tx = await makeVersionedTransactions(
                    connection,
                    mainWallet,
                    instructions
                );
                tx.sign([mainWallet]);
                // const res = await connection.simulateTransaction(tx);
                // console.log("res", res);
                await createAndSendBundleEx(connection, mainWallet, [tx]);
            }
            console.log(`Distributing ended for ${ith}th group wallets`);
            idx += 5;
            ith ++;
        }

    } catch (e) {
        console.log('Distribute sol error : ', e);
    }

}

export const sleep = (ms: any) => new Promise((r) => setTimeout(r, ms));

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
        instructions: [instruction],
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

export const createAndSendBundleEx = async (connection: Connection, payer: Keypair, bundleTransactions: VersionedTransaction[]) => {
    try {

        const tipTx = await getTipVesionedTransaction(connection, payer.publicKey, Number(process.env.JITO_BUNDLE_TIP));

        if (!tipTx) {
            return false;
        }

        tipTx.sign([payer]);

        bundleTransactions.push(tipTx);

        const rawTxns = bundleTransactions.map(item => bs58.encode(item.serialize()));

        const { data: bundleRes } = await axios.post(`https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles`,
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

        const res = await checkBundle(bundleUUID);

        return res;
    } catch (error) {
        console.error("Error creating and sending bundle.", error);
    }
    return false;
};

const checkBundle = async (uuid: any) => {
    let count = 0;
    while (1) {
        try {
            const response = await (
                await fetch(`https://amsterdam.mainnet.block-engine.jito.wtf/api/v1/bundles`, {
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

            console.log("response", response.result.value.length);
            console.log("bundle_id", response.result.value[0].bundle_id);

            if (response?.result?.value?.length == 1 && response?.result?.value[0]?.bundle_id) {
                console.log('Bundle Success:', uuid);
                return true;
            }

        } catch (error) {
            // console.log('Check Bundle Failed', error);
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

sendSolsToSubWallets();