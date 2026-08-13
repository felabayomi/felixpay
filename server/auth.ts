import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import type { Express, Request, RequestHandler } from "express";
import { eq } from "drizzle-orm";
import { db } from "./db";
import { storage } from "./storage";
import { users } from "@shared/schema";

async function hydrateFelixPayUser(req: Request): Promise<any | null> {
  const auth = getAuth(req);
  if (!auth.isAuthenticated || !auth.userId) return null;

  const clerkUser = await clerkClient.users.getUser(auth.userId);
  const primaryEmail = clerkUser.emailAddresses.find(
    (address) => address.id === clerkUser.primaryEmailAddressId,
  )?.emailAddress ?? clerkUser.emailAddresses[0]?.emailAddress;

  if (!primaryEmail) throw new Error("The Clerk account does not have an email address");

  const [existingUser] = await db.select().from(users).where(eq(users.email, primaryEmail)).limit(1);
  const appUser = await storage.upsertUser({
    // Preserve the existing FelixPay user ID so memberships and payment history stay attached.
    id: existingUser?.id ?? auth.userId,
    email: primaryEmail,
    firstName: clerkUser.firstName,
    lastName: clerkUser.lastName,
    profileImageUrl: clerkUser.imageUrl,
  });

  const compatibleUser = {
    claims: {
      sub: appUser.id,
      email: appUser.email,
      first_name: appUser.firstName,
      last_name: appUser.lastName,
      profile_image_url: appUser.profileImageUrl,
    },
    clerkUserId: auth.userId,
  };
  (req as any).user = compatibleUser;
  return compatibleUser;
}

export function setupAuth(app: Express) {
  app.set("trust proxy", 1);
  const authorizedParties = process.env.CLERK_AUTHORIZED_PARTIES
    ?.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.use(clerkMiddleware({ authorizedParties }));
  app.get("/api/login", (_req, res) => res.redirect("/?signIn=true"));
  app.get("/api/logout", (_req, res) => res.redirect("/?signOut=true"));
}

export const isAuthenticated: RequestHandler = async (req, res, next) => {
  try {
    const user = await hydrateFelixPayUser(req);
    if (!user) return res.status(401).json({ message: "Unauthorized" });
    return next();
  } catch (error) {
    console.error("Clerk authentication failed:", error);
    return res.status(401).json({ message: "Unauthorized" });
  }
};
