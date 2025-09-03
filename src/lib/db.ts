import { PrismaClient } from "@prisma/client";
import { v4 as uuidv4 } from "uuid";

// Create a global singleton instance of Prisma
declare global {
  var prisma: PrismaClient | undefined;
}

// Use the existing instance or create a new one
export const prisma = global.prisma || new PrismaClient();

// Save the instance in development to prevent multiple instances
if (process.env.NODE_ENV !== "production") {
  global.prisma = prisma;
}

// Helper function to execute SQL-like queries using Prisma
export async function sql(strings: TemplateStringsArray, ...values: any[]) {
  // This is a compatibility layer to support the existing SQL template literals
  // Convert SQL-style queries to Prisma operations
  const fullQuery = strings.reduce((acc, str, i) => {
    return acc + str + (i < values.length ? `$${i + 1}` : "");
  }, "");

  try {
    // Execute raw query using Prisma
    const result = await prisma.$queryRawUnsafe(fullQuery, ...values);
    return Array.isArray(result) ? result : [result];
  } catch (error) {
    console.error("Database query error:", error);
    throw error;
  }
}

// Initialize the database schema - no longer needed with Prisma
// Kept for backward compatibility but now acts as a no-op
async function initializeDatabase() {
  try {
    // Create default user for local usage if it doesn't exist
    const localUser = await prisma.user.upsert({
      where: { username: "local" },
      update: {},
      create: {
        id: "local-user",
        username: "local",
        email: "local@permavid.app",
        displayName: "Local User",
      },
    });

    console.log("Neon PostgreSQL database with Prisma initialized");
  } catch (dbError) {
    console.error("------------------------------------------");
    console.error(
      "FATAL: Could not initialize Neon PostgreSQL database with Prisma!",
    );
    console.error(dbError);
    console.error("------------------------------------------");
    throw new Error(`Failed to initialize database: ${dbError}`);
  }
}

// Get current user ID (for attribution purposes only, not for data isolation)
async function getCurrentUserId(): Promise<string> {
  // In browser environment, get user from localStorage
  if (typeof window !== "undefined") {
    try {
      const savedUser = localStorage.getItem("auth_user");
      if (savedUser) {
        const userData = JSON.parse(savedUser);
        return userData.id;
      }
    } catch (error) {
      console.error("Error getting user from localStorage:", error);
    }
  }

  // Fallback: try to find or create local user
  const localUser = await prisma.user.upsert({
    where: { username: "local" },
    update: {},
    create: {
      id: "local-user",
      username: "local",
      email: "local@permavid.app",
      displayName: "Local User",
    },
  });

  return localUser.id;
}

// Export the prisma client and utility functions
export { initializeDatabase, getCurrentUserId };
