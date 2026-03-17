import { NextResponse } from "next/server";
import { getDatabase } from "@/app/lib/db";

const DEFAULT_USER_ID = "default";

export async function GET() {
  try {
    const db = getDatabase();
    const user = db
      .prepare("SELECT balance FROM virtual_trading WHERE user_id = ?")
      .get(DEFAULT_USER_ID) as { balance: number } | undefined;

    if (!user) {
      // Initialize with default balance
      const initialBalance = 10000;
      db.prepare(
        "INSERT INTO virtual_trading (user_id, balance) VALUES (?, ?)"
      ).run(DEFAULT_USER_ID, initialBalance);
      return NextResponse.json({ success: true, balance: initialBalance });
    }

    return NextResponse.json({ success: true, balance: user.balance });
  } catch (error) {
    console.error("Error fetching balance:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to fetch balance",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  try {
    const { balance } = await request.json();
    const db = getDatabase();

    db.prepare(
      `INSERT INTO virtual_trading (user_id, balance, updated_at) 
       VALUES (?, ?, strftime('%s', 'now'))
       ON CONFLICT(user_id) DO UPDATE SET 
         balance = excluded.balance, 
         updated_at = strftime('%s', 'now')`
    ).run(DEFAULT_USER_ID, balance);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error saving balance:", error);
    return NextResponse.json(
      {
        success: false,
        error: "Failed to save balance",
        message: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

