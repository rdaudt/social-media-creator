import "next-auth";
import "next-auth/jwt";
import { DefaultSession } from "next-auth";

declare module "next-auth" {
  interface Session {
    user: DefaultSession["user"] & {
      email: string;
      sub: string;
      role: "coach" | "admin";
    };
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: "coach" | "admin";
  }
}
