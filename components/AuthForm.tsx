"use client";

import Image from "next/image";
import Link from "next/link";
import React, { useEffect, useState } from "react";

import { z } from "zod";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { Button } from "@/components/ui/button";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import CustomInput from "./CustomInput";
import { authFormSchema } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { getLoggedInUser, signIn, signUp } from "@/lib/actions/user.actions";

const AuthForm = /*async*/ ({ type }: { type: string }) => {
  // we want to navigate to the home page if we successfully sign in
  // we will need access to the router
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(false);

  /* 
    We are going to try and fix the server side issues we're having, because this file has 'use-client' at the top, this is a Client Component; 
    and we can't use the 'getLoggedInUser' function here becuase 'async/await' are Server Side functions.
    Currently it keeps rerendering in a loop because React is trying to resolve this 'await' within a Client Component—which is not possible.

    Seeing if 'useEffect' works for client-side fetching, because this file needs to remain a Client Component.
  */
  useEffect(() => {
    const fetchUser = async () => {
      const loggedInUser = await getLoggedInUser()
      if ( loggedInUser ) {
        setUser(loggedInUser)
        router.push('/') // redirect to the home page
      }
    }

    fetchUser()
  }, [router])

  // modify the form schema to include the new fields
  const formSchema = authFormSchema(type);

  // 1. Define your form.
  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      email: "",
      password: "",
    },
  });

  // 2. Define a submit handler.
  const onSubmit = async (data: z.infer<typeof formSchema>) => {
    // Do something with the form values.
    // ✅ This will be type-safe and validated.
    setIsLoading(true);
    
    try {
      // sign up w Appwrite & create Plaid link token

      if (type === 'sign-up') {
        const { newUser } = await signUp(data) // extract newUser from the response

        setUser(newUser) // set the user state to the newUser
      }

      if (type === 'sign-in') {
        const response = await signIn({
          email: data.email,
          password: data.password
        })

        if (response) router.push('/')
      }
    } catch (error) {
      console.log(error);
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <section className="auth-form">
      <header className="flex flex-col gap-5 md:gap-8 lg:w-fill">
        <Link href="/" className="cursor-pointer flex items-center gap-1">
          <Image
            src="/icons/logo.svg"
            width={34}
            height={34}
            alt="Horizon logo"
          />
          <h1 className="text-26 font-ibm-plex-serif font-bold text-black-1">
            Horizon
          </h1>
        </Link>

        <div className="flex flex-col gap-1 md:gap-3">
          <h1 className="text-24 ;g:text-36 font-semibold text-gray-900">
            {user 
              ? "Link Account" 
              : type === "sign-in" 
                ? "Sign In" 
                : "Sign Up"
            }
            <p className="text-16 font-normal text-gray-600">
              {user
                ? "Link your account to get started"
                : "Pleae enter your details to continue"}
            </p>
          </h1>
        </div>
      </header>
      {user ? (
          <div className="flex flex-col gap-4">{/* PlaidLink */}</div>
        ) : (
          <>
            <Form {...form}>
              <form
                onSubmit={form.handleSubmit(onSubmit)}
                className="space-y-8"
              >
                {type === "sign-up" && (
                  <>
                    <div className="flex-pair">
                      <CustomInput control={form.control}
                        name="firstName" label="First Name"
                        placeholder=""
                      />
                      <CustomInput control={form.control}
                        name="lastName" label="Last Name"
                        placeholder=""
                      />
                    </div>

                    <CustomInput control={form.control}
                      name="address1" label="Address"
                      placeholder=""
                    />
                    <CustomInput control={form.control}
                      name="city" label="City"
                      placeholder=""
                    />

                    <div className="flex-pair">
                      <CustomInput control={form.control}
                        name="state" label="State"
                        placeholder="ex. NY"
                      />
                      <CustomInput control={form.control}
                        name="postalCode" label="Postal Code"
                        placeholder="ex. 10001"
                      />
                    </div>

                    <div className="flex-pair">
                      <CustomInput control={form.control}
                        name="dateOfBirth" label="Date of Birth"
                        placeholder="yyyy-mm-dd"
                      />
                      <CustomInput control={form.control}
                        name="ssn" label="SSN"
                        placeholder="xxx-xx-xxxx"
                      />
                    </div>
                  </>
                )}

                <CustomInput control={form.control}
                  name="email" label="Email"
                  placeholder=""
                />

                <CustomInput control={form.control}
                  name="password" label="Password"
                  placeholder=""
                />

                <div className="flex flex-col gap-4">
                  <Button
                    type="submit"
                    disabled={isLoading}
                    className="form-btn"
                  >
                    {isLoading ? (
                      <>
                        <Loader2 className="animate-spin" size={20} />
                        &nbsp;Loading...
                      </>
                    ) : type === "sign-in" ? (
                      "Sign In"
                    ) : (
                      "Sign Up"
                    )}
                  </Button>
                </div>
              </form>
            </Form>

            <footer className="flex justify-center gap-1">
              <p className="text-14 font-normal text-gray-600">
                {type === "sign-in"
                  ? "Don't have an account?"
                  : "Already have an account?"}
              </p>

              <Link href={type === "sign-in" ? "/sign-up" : "/sign-in"} className="form-link">
                {type === "sign-in" ? "Sign Up" : "Sign In"}
              </Link>
            </footer>
          </>
        )}
    </section>
  );
};

export default AuthForm;
