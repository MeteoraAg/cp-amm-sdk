import {
  AccountLayout,
  createAssociatedTokenAccountIdempotentInstruction,
  createCloseAccountInstruction,
  getAccount,
  getAssociatedTokenAddressSync,
  getMint,
  NATIVE_MINT,
  TOKEN_2022_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  TokenAccountNotFoundError,
  TokenInvalidAccountOwnerError,
} from "@solana/spl-token";
import {
  Connection,
  PublicKey,
  SystemProgram,
  TransactionInstruction,
} from "@solana/web3.js";

export function getTokenProgram(flag: number): PublicKey {
  return flag == 0 ? TOKEN_PROGRAM_ID : TOKEN_2022_PROGRAM_ID;
}
export const getTokenDecimals = async (
  connection: Connection,
  mint: PublicKey
): Promise<number> => {
  return (await getMint(connection, mint)).decimals;
};

export const getOrCreateATAInstruction = async (
  connection: Connection,
  tokenMint: PublicKey,
  owner: PublicKey,
  payer: PublicKey = owner,
  allowOwnerOffCurve = true,
  tokenProgram: PublicKey
): Promise<{ ataPubkey: PublicKey; ix?: TransactionInstruction }> => {
  const toAccount = getAssociatedTokenAddressSync(
    tokenMint,
    owner,
    allowOwnerOffCurve,
    tokenProgram
  );

  try {
    await getAccount(connection, toAccount);
    return { ataPubkey: toAccount, ix: undefined };
  } catch (e) {
    if (
      e instanceof TokenAccountNotFoundError ||
      e instanceof TokenInvalidAccountOwnerError
    ) {
      const ix = createAssociatedTokenAccountIdempotentInstruction(
        payer,
        toAccount,
        owner,
        tokenMint,
        tokenProgram
      );

      return { ataPubkey: toAccount, ix };
    } else {
      /* handle error */
      console.error("Error::getOrCreateATAInstruction", e);
      throw e;
    }
  }
};

export const wrapSOLInstruction = (
  from: PublicKey,
  to: PublicKey,
  amount: bigint
): TransactionInstruction[] => {
  return [
    SystemProgram.transfer({
      fromPubkey: from,
      toPubkey: to,
      lamports: amount,
    }),
    new TransactionInstruction({
      keys: [
        {
          pubkey: to,
          isSigner: false,
          isWritable: true,
        },
      ],
      data: Buffer.from(new Uint8Array([17])),
      programId: TOKEN_PROGRAM_ID,
    }),
  ];
};

export const unwrapSOLInstruction = async (
  owner: PublicKey,
  allowOwnerOffCurve = true
) => {
  const wSolATAAccount = getAssociatedTokenAddressSync(
    NATIVE_MINT,
    owner,
    allowOwnerOffCurve
  );
  if (wSolATAAccount) {
    const closedWrappedSolInstruction = createCloseAccountInstruction(
      wSolATAAccount,
      owner,
      owner,
      [],
      TOKEN_PROGRAM_ID
    );
    return closedWrappedSolInstruction;
  }
  return null;
};

export async function getNftOwner(
  connection: Connection,
  nftMint: PublicKey
): Promise<PublicKey> {
  const largesTokenAccount = await connection.getTokenLargestAccounts(nftMint);
  const accountInfo = await connection.getParsedAccountInfo(
    largesTokenAccount.value[0].address
  );
  // @ts-ignore
  const owner = new PublicKey(accountInfo.value.data.parsed.info.owner);

  return new PublicKey(owner);
}

export async function getAllNftByUser(
  connection: Connection,
  user: PublicKey,
  tokenProgram = TOKEN_2022_PROGRAM_ID
): Promise<string[]> {
  const allUserTokenAccounts = await connection.getTokenAccountsByOwner(user, {
    programId: tokenProgram,
  });

  const userNfts: string[] = [];
  for (const { account } of allUserTokenAccounts.value) {
    const tokenAccountData = AccountLayout.decode(account.data);
    if (tokenAccountData.amount.toString() === "1") {
      userNfts.push(tokenAccountData.mint.toString());
    }
  }
  return userNfts;
}
