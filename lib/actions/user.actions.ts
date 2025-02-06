"use server";

import { ID } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { encryptId, extractCustomerIdFromUrl, parseStringify } from "../utils";
import { CountryCode, ProcessorTokenCreateRequest, ProcessorTokenCreateRequestProcessorEnum, Products } from "plaid";
import { plaidClient } from "../plaid";
import { revalidatePath } from "next/cache";
import { addFundingSource, createDwollaCustomer } from "./dwolla.actions";

// adding this so it's unneccessary to use 'process.env' everytime
const {
  APPWRITE_DATABASE_ID: DATABASE_ID,
  APPWRITE_USER_COLLECTION_ID: USER_COLLECTION_ID,
  APPWRITE_BANK_COLLECTION_ID: BANK_COLLECTION_ID,
} = process.env;

export const signIn = async ({ email, password }: signInProps) => {
  try {
    // data mutation || modify database || fetch data
    const { account } = await createAdminClient()
    const session = await account.createEmailPasswordSession(email, password)
    console.log("Session created successfully:", session); // debug log


    // ✅ Use `cookies().set()` to store the session cookie
    ( await cookies() ).set(
      `a_session_${process.env.NEXT_PUBLIC_APPWRITE_PROJECT}`,
      session.secret,
      {
        path: "/",
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
      }
    )

    return { success: true }
  } catch (error) {
    console.error("Error", error);
  }
};

export const signUp = async ({ password, ...userData }: SignUpParams) => {
  // destructure the userData
  const { email, firstName, lastName } = userData;

  // what does it mean for a function to be atomic? an atomic transaction is one that either works or it doesn't—there's no in-between. we need to ensure that if it goes through, it goes to the end; and if it doesn't, it needs to fail.
  // we can't create a user account to the session, and then not add the user to the database. or, we can't add a user to the database and then not connect them to Plaid. this account creation needs to run flawlessly in all three steps.
  let newUserAccount

  try {
    const { account, database } = await createAdminClient(); // use Appwrite to create a new user account

    newUserAccount = await account.create(
      ID.unique(),
      email,
      password,
      `${firstName} ${lastName}`
    );

    if(!newUserAccount) throw new Error("Error creating user");

    const dwollaCustomerUrl = await createDwollaCustomer({
      ...userData,
      type: 'personal'
    })

    if(!dwollaCustomerUrl) throw new Error("Error creating Dwolla customer")

    // now that we have the Dwolla customer URL, we have to extract the customer ID
    const dwollaCustomerId = extractCustomerIdFromUrl(dwollaCustomerUrl)

    const newUser = await database.createDocument(
      DATABASE_ID!,
      USER_COLLECTION_ID!,
      ID.unique(),
      {
        ...userData,
        userId: newUserAccount.$id,
        dwollaCustomerId,
        dwollaCustomerUrl,
      }
    )

    console.log("New user created:", newUserAccount); // Log the raw user object
    console.log("Serialized user object:", parseStringify(newUserAccount)); // Log the serialized version

    const session = await account.createEmailPasswordSession(email, password);

    /*
      The `cookies()` function returns a `Promise<ReadonlyRequestCookies>`only when used in server actions. You need to call `.set()` directly on the resolved result if you make the function `async`

        cookies().set("my-custom-session", session.secret, {
        path: "/",
        httpOnly: true,
        sameSite: "strict",
        secure: true,
        });

      We're going to set the cookie using NextResponse from `next/server`
    */

    const response = NextResponse.json({ success: true });
    response.cookies.set("appwrite-session", session.secret, {
      path: "/",
      httpOnly: true,
      sameSite: "strict",
      secure: true,
    });

    return {
      newUser: parseStringify(newUser), 
      success: true, 
      // wrapping return block in an object to give the client a clear response
    }
  } catch (error) {
    console.error("Error details:", error);
  
    if (error instanceof Error) {
      throw new Error(`Failed to create user account: ${error.message}`);
    } else {
      throw new Error("Failed to create user account: An unknown error occurred");
    }
  }
};

export async function getLoggedInUser() {
  try {
    console.log("Fetching logged-in user...")
    const { account } = await createSessionClient();

    const user =  await account.get();
    console.log("Logged-in user:", user)

    return parseStringify(user) // ensure serializable data
  } catch (error: any) {
    if (error.message && error.message.includes("User (role: guests) missing scope")) {
      // If it's a guest session, simply return null
      return null;
    }

    console.error('Error in getLoggedInUser', error)
    return null;
  }
}

export const logoutAccount = async () => {
  try {
    const { account } = await createSessionClient();

    (await cookies()).delete('appwrite-session')

    await account.deleteSession('current')
  } catch (error) {
    console.error("Error in logoutAccount", error)
    return null
  }
}

export const createLinkToken = async (user: User) => {
  try {
    const tokenParams = {
      user: {
        client_user_id: user.$id
      },
      client_name: `${user.firstName} ${user.lastName}`,
      products: ['auth'] as Products[],
      language: 'en',
      country_codes: ['US'] as CountryCode[],
    }

    const response = await plaidClient.linkTokenCreate(tokenParams)

    return parseStringify({ linkToken: response.data.link_token })
  } catch (error) {
    console.log("Error in createLinkToken", error)
  }
}

export const createBankAccount = async ({
  userId,
  bankId,
  accountId,
  accessToken,
  fundingSourceUrl,
  shareableId,
}: createBankAccountProps) => {
  try {
    // create a bank account—strictly—within Appwrite
    const { database } = await createAdminClient()

    const bankAccount = await database.createDocument(
      DATABASE_ID!,
      BANK_COLLECTION_ID!,
      ID.unique(),
      {
        userId,
        bankId,
        accountId,
        accessToken,
        fundingSourceUrl,
        shareableId,
      }
    )
  } catch (error) {

  }
}

export const exchangePublicToken = async ({ publicToken, user }: exchangePublicTokenProps) => {
  try {
    // exchange the public token for an access token and item ID
    const response = await plaidClient.itemPublicTokenExchange({
      public_token: publicToken
    })

    const accessToken = response.data.access_token
    const itemId = response.data.item_id

    // get account info from Plaid using the access token
    const accountsResponse = await plaidClient.accountsGet({ access_token: accessToken })

    const accountData = accountsResponse.data.accounts[0]

    // create a request token for Dwolla using the access token and account ID
    const request: ProcessorTokenCreateRequest = {
      access_token: accessToken,
      account_id: accountData.account_id,
      processor: 'dwolla' as ProcessorTokenCreateRequestProcessorEnum,
    }

    // now that we have the request token, we can generate the processor token
    const processorTokenResponse = await plaidClient.processorTokenCreate(request)
    const processorToken = processorTokenResponse.data.processor_token

    // create a funding source URL for the account using the Dwolla customer ID,
    // processor token, and bank name
    // think of this as connecting the payment processing functionality to our specific bank account so it can send and recieve funds
    const fundingSourceUrl = await addFundingSource({
      dwollaCustomerId: user.dwollaCustomerId,
      processorToken,
      bankName: accountData.name,
    })

    // if the funding source URL is not created, throw an error
    if (!fundingSourceUrl) throw Error("Failed to create funding source URL")

    // create a bank account using user ID, item ID, account ID, access token, funding source URL, and sharable ID
    await createBankAccount({
      userId: user.$id,
      bankId: itemId,
      accountId: accountData.account_id,
      accessToken,
      fundingSourceUrl,
      shareableId: encryptId(accountData.account_id),
    })

    // revalidate the path to reflect the changes
    revalidatePath('/')

    // finally, return a success message after all this hard work
    return parseStringify({ publicTokenExchange: 'complete' })
  } catch (error) {
    console.error("Error in exchangePublicToken", error)
  }
}