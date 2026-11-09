import prisma from "./db";

export interface BudgetGuardResult {
  exceeded: boolean;
  totalUsedToday: number;
  dailyCap: number;
}

export async function checkDailyTokenBudget(): Promise<BudgetGuardResult> {
  const dailyCap = Number(process.env.GLOBAL_DAILY_TOKEN_CAP || 200000);

  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    type UsageRow = {
      total_tokens: number | null;
    };

    const rows: UsageRow[] = await prisma.$queryRaw<UsageRow[]>`
      SELECT 
        COALESCE(SUM((usage->>'totalTokens')::int), 0)::int AS total_tokens
      FROM messages
      WHERE created_at >= ${today}
        AND usage IS NOT NULL;
    `;

    const totalUsedToday = rows[0]?.total_tokens ? Number(rows[0].total_tokens) : 0;

    return {
      exceeded: totalUsedToday >= dailyCap,
      totalUsedToday,
      dailyCap,
    };
  } catch (err) {
    console.warn("Daily budget check failed, defaulting to within budget:", err);
    return {
      exceeded: false,
      totalUsedToday: 0,
      dailyCap,
    };
  }
}

