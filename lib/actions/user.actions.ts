"use server";

import { ID } from "node-appwrite";
import { createAdminClient, createSessionClient } from "../appwrite";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { parseStringify } from "../utils";

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

export const signUp = async (userData: SignUpParams) => {
  // destructure the userData
  const { email, password, firstName, lastName } = userData;

  try {
    // use Appwrite to create a new user account
    const { account } = await createAdminClient();

    const newUserAccount = await account.create(
      ID.unique(),
      email,
      password,
      `${firstName} ${lastName}`
    );

    console.log("New user created:", newUserAccount); // Log the raw user object
    console.log("Serialized user object:", parseStringify(newUserAccount)); // Log the serialized version

    const session = await account.createEmailPasswordSession(email, password);

    /*
      The `cookies()` function returns a `Promise<ReadonlyRequestCookies>`only when used in server actions. You need to call `.set()` directly on the
      resolved result if you make the function `async`

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

    // return both the user account and the response
    return {
      newUser: parseStringify(newUserAccount), 
      /*
        response, // HTTP response if needed
        ^^ returning 'response' like this will cause the function to fail bc the 'Response' object from 'NextResponse' can't be serialized and 
          passed to the client directly from a server component (such as this user.actions.ts component).

        Only return serializable data from server actions. The 'Response' object handles server side behaior (like setting cookies), so there is no need to return it.
      */
      success: true, // adding only for clarity
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