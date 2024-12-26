import { Keypair } from "@solana/web3.js";
import { writeFileSync } from "fs";
import bs58 from "bs58";

// Define Wallet interface
interface Wallet {
    public_key: string;
    private_key: string;
}

export const generateWallets = async (count: number) => {
    const keyFile = `keys.json`;
    const wallets : Wallet[] = [];
    console.log('Start Generating 30 Wallets...');
    for (let i = 0; i < count; i++) {
        const keypair = Keypair.generate();
        wallets.push({
            public_key: keypair.publicKey.toBase58(),
            private_key: bs58.encode(keypair.secretKey)
        });
    }
    const keypairArray = JSON.stringify(wallets, null, 2); // Convert keypair object to a pretty JSON string
    writeFileSync(keyFile, keypairArray);
    console.log('Generated 30 Wallets...');
    return wallets;
};

generateWallets(30);