"use server";

import { Client, Account, Databases, Users } from "node-appwrite";
import { cookies } from "next/headers";

export async function createSessionClient() {
  const client = new Client()
  // after installing the 'node-appwrite' pkge, our public env variables throw us a warning that they might be undefined.
  // We know that they are defined, so we can let typescript know that by simply adding a '!' at the end of the variable.

    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!)

  /*
    `const session = await cookies().get("my-custom-session");`

    The above line was provided by the docs, but it didn't work for me.
    
    The `cookies()` function returns a `Promise<ReadonlyRequestCookies>`only when used in server actions. You need to call `.get()` directly on the
    resolved result if you make the function `async` 
  */

  // manually retrieve the session cookie
  const session = await cookies();
  const sessionCookie = session.get(`a_session_${process.env.NEXT_PUBLIC_APPWRITE_PROJECT}`);

  if (!sessionCookie || !sessionCookie.value) {
    console.warn("No session cookie found in createSessionClient()");
    throw new Error("No session available.");
  }
  console.log("✅ Found session cookie:", sessionCookie.value); // Debugging

  // manually set the session in Appwrite
  client.setSession(sessionCookie.value)

  return {
    get account() {
      return new Account(client);
    },
  };
}

export async function createAdminClient() {
  const client = new Client()
    .setEndpoint(process.env.NEXT_PUBLIC_APPWRITE_ENDPOINT!)
    .setProject(process.env.NEXT_PUBLIC_APPWRITE_PROJECT!)
    .setKey(process.env.NEXT_APPWRITE_KEY!);

  return {
    get account() {
      return new Account(client);
    },

    get database() {
      return new Databases(client)
    },

    get user() {
      return new Users(client)
    }
  };
}
