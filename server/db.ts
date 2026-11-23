import { eq, desc, and } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { InsertUser, users, conversations, InsertConversation, Conversation } from "../drizzle/schema";
import { ENV } from './_core/env';

let _db: ReturnType<typeof drizzle> | null = null;

// Lazily create the drizzle instance so local tooling can run without a DB.
export async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    try {
      _db = drizzle(process.env.DATABASE_URL);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

export async function upsertUser(user: InsertUser): Promise<void> {
  if (!user.openId) {
    throw new Error("User openId is required for upsert");
  }

  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot upsert user: database not available");
    return;
  }

  try {
    const values: InsertUser = {
      openId: user.openId,
    };
    const updateSet: Record<string, unknown> = {};

    const textFields = ["name", "email", "loginMethod"] as const;
    type TextField = (typeof textFields)[number];

    const assignNullable = (field: TextField) => {
      const value = user[field];
      if (value === undefined) return;
      const normalized = value ?? null;
      values[field] = normalized;
      updateSet[field] = normalized;
    };

    textFields.forEach(assignNullable);

    if (user.lastSignedIn !== undefined) {
      values.lastSignedIn = user.lastSignedIn;
      updateSet.lastSignedIn = user.lastSignedIn;
    }
    if (user.role !== undefined) {
      values.role = user.role;
      updateSet.role = user.role;
    } else if (user.openId === ENV.ownerOpenId) {
      values.role = 'admin';
      updateSet.role = 'admin';
    }

    if (!values.lastSignedIn) {
      values.lastSignedIn = new Date();
    }

    if (Object.keys(updateSet).length === 0) {
      updateSet.lastSignedIn = new Date();
    }

    await db.insert(users).values(values).onDuplicateKeyUpdate({
      set: updateSet,
    });
  } catch (error) {
    console.error("[Database] Failed to upsert user:", error);
    throw error;
  }
}

export async function getUserByOpenId(openId: string) {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get user: database not available");
    return undefined;
  }

  const result = await db.select().from(users).where(eq(users.openId, openId)).limit(1);

  return result.length > 0 ? result[0] : undefined;
}

// Conversation queries
export async function saveConversation(conversation: InsertConversation): Promise<Conversation | null> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot save conversation: database not available");
    return null;
  }

  try {
    const result = await db.insert(conversations).values(conversation);
    const saved = await db.select().from(conversations).where(eq(conversations.id, result[0].insertId as number)).limit(1);
    return saved.length > 0 ? saved[0] : null;
  } catch (error) {
    console.error("[Database] Failed to save conversation:", error);
    return null;
  }
}

export async function getUserConversations(userId: number): Promise<Conversation[]> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot get conversations: database not available");
    return [];
  }

  try {
    return await db.select().from(conversations).where(eq(conversations.userId, userId)).orderBy(desc(conversations.createdAt));
  } catch (error) {
    console.error("[Database] Failed to get conversations:", error);
    return [];
  }
}

export async function getConversationById(
  conversationId: number,
  userId: number
): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(conversations)
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)))
    .limit(1);

  return result[0];
}

export async function setConversationFavorite(
  conversationId: number,
  userId: number,
  isFavorite: boolean
): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await db
    .update(conversations)
    .set({ isFavorite })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));

  return getConversationById(conversationId, userId);
}

export async function setConversationShareToken(
  conversationId: number,
  userId: number,
  shareToken: string
): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  await db
    .update(conversations)
    .set({ shareToken })
    .where(and(eq(conversations.id, conversationId), eq(conversations.userId, userId)));

  return getConversationById(conversationId, userId);
}

export async function getConversationByShareToken(
  shareToken: string
): Promise<Conversation | undefined> {
  const db = await getDb();
  if (!db) return undefined;

  const result = await db
    .select()
    .from(conversations)
    .where(eq(conversations.shareToken, shareToken))
    .limit(1);

  return result[0];
}

export async function deleteConversation(conversationId: number, userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot delete conversation: database not available");
    return false;
  }

  try {
    await db.delete(conversations).where(
      and(eq(conversations.id, conversationId), eq(conversations.userId, userId))
    );
    return true;
  } catch (error) {
    console.error("[Database] Failed to delete conversation:", error);
    return false;
  }
}

export async function clearUserConversations(userId: number): Promise<boolean> {
  const db = await getDb();
  if (!db) {
    console.warn("[Database] Cannot clear conversations: database not available");
    return false;
  }

  try {
    await db.delete(conversations).where(eq(conversations.userId, userId));
    return true;
  } catch (error) {
    console.error("[Database] Failed to clear conversations:", error);
    return false;
  }
}
