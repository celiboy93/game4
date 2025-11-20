// db.ts
import { 
    User, Transaction, Product, Voucher, Announcement, PaymentInfo, GlobalBonus, DigitalSaleLog,
    TIER_THRESHOLDS, RATE_LIMIT_WINDOW_MS, MAX_REQUESTS_PER_WINDOW,
    calculateTier, formatCurrency, hashPassword
} from "./shared.ts";

export const kv = await Deno.openKv();

// --- Rate Limit ---
export async function checkRateLimit(identifier: string): Promise<boolean> {
    const key = ["rate_limit", identifier];
    const result = await kv.get<number>(key);
    const currentCount = result.value || 0;
    if (currentCount >= MAX_REQUESTS_PER_WINDOW) return false;
    await kv.set(key, currentCount + 1, { expireIn: RATE_LIMIT_WINDOW_MS });
    return true; 
}

// --- User Functions ---
export async function getUserByUsername(username: string): Promise<User | null> {
    const result = await kv.get<User>(["users", username]);
    return result.value;
}

export async function getAllUsers(): Promise<User[]> {
    const entries = kv.list<User>({ prefix: ["users"] });
    const users: User[] = [];
    for await (const entry of entries) users.push(entry.value);
    return users.sort((a, b) => a.username.localeCompare(b.username));
}

export async function registerUser(username: string, passwordHash: string): Promise<boolean> {
    const bonus = await getGlobalBonus();
    let startBalance = 0;
    let hasReceived = false;
    if (bonus && bonus.isActive) {
        startBalance = bonus.amount;
        hasReceived = true;
    }
    const user: User = { 
        username, passwordHash, balance: startBalance, 
        isBlocked: false, receivedBonus: hasReceived,
        lifetimeSpend: 0, tier: "Bronze"
    };
    const key = ["users", username];
    const res = await kv.atomic().check({ key, versionstamp: null }).set(key, user).commit();
    if (res.ok && startBalance > 0) {
        await logTransaction(username, startBalance, "topup", "Welcome Bonus");
    }
    return res.ok;
}

export async function updateUserBalance(username: string, amountChange: number): Promise<boolean> {
    const key = ["users", username];
    while (true) {
        const result = await kv.get<User>(key);
        if (!result.value) return false;
        const user = result.value;
        const newBalance = user.balance + amountChange;
        if (newBalance < 0) return false;
        const res = await kv.atomic().check(result).set(key, { ...user, balance: newBalance }).commit();
        if (res.ok) return true;
    }
}

export async function updateUserSpendAndTier(username: string, spendChange: number): Promise<boolean> {
    const key = ["users", username];
    while (true) {
        const result = await kv.get<User>(key);
        if (!result.value) return false;
        const user = result.value;
        const newLifetimeSpend = Math.max(0, (user.lifetimeSpend ?? 0) + spendChange);
        const newTier = calculateTier(newLifetimeSpend);
        const res = await kv.atomic().check(result).set(key, { ...user, lifetimeSpend: newLifetimeSpend, tier: newTier }).commit();
        if (res.ok) return true;
    }
}

export async function resetUserPassword(username: string, newPasswordHash: string): Promise<boolean> {
    const key = ["users", username];
    const result = await kv.get<User>(key);
    if (!result.value) return false;
    const hashedPassword = await hashPassword(newPasswordHash);
    const res = await kv.atomic().check(result).set(key, { ...result.value, passwordHash: hashedPassword }).commit();
    return res.ok;
}

export async function toggleBlockUser(username: string): Promise<string> {
    const key = ["users", username];
    const result = await kv.get<User>(key);
    if (!result.value) return "User not found.";
    const user = result.value;
    const newStatus = !user.isBlocked;
    const res = await kv.atomic().check(result).set(key, { ...user, isBlocked: newStatus }).commit();
    return res.ok ? (newStatus ? "User Blocked" : "User Unblocked") : "Failed.";
}

// --- Transaction Functions ---
export async function logTransaction(username: string, amount: number, type: "topup" | "purchase", itemName?: string, itemDetails?: string): Promise<void> {
    const timestamp = new Date().toISOString();
    await kv.set(["transactions", username, timestamp], { type, amount, timestamp, itemName, itemDetails });
}

export async function getTransactions(username: string, limit: number, cursor?: string): Promise<{ transactions: Transaction[], nextCursor: string | undefined }> {
    const entries = kv.list<Transaction>({ prefix: ["transactions", username], limit, cursor }, { reverse: true });
    const transactions: Transaction[] = [];
    for await (const entry of entries) transactions.push(entry.value);
    return { transactions, nextCursor: entries.cursor };
}

export async function getSalesSummary(): Promise<{ totalUsers: number, totalRevenue: number, totalSales: number }> {
    const allUsers = kv.list({ prefix: ["users"] });
    const allTx = kv.list<Transaction>({ prefix: ["transactions"] });
    let totalUsers = 0; for await (const _ of allUsers) totalUsers++;
    let totalRevenue = 0, totalSales = 0;
    for await (const entry of allTx) {
        const t = entry.value;
        if (t.isRolledBack) continue;
        if (t.type === "topup" && t.amount > 0) totalRevenue += t.amount;
        else if (t.type === "purchase" && t.amount < 0) totalSales += Math.abs(t.amount);
    }
    return { totalUsers, totalRevenue, totalSales };
}

export async function getDigitalSalesHistory(): Promise<DigitalSaleLog[]> {
    const entries = kv.list<Transaction>({ prefix: ["transactions"] });
    const logs: DigitalSaleLog[] = [];
    for await (const entry of entries) {
        const t = entry.value;
        if (t.type === 'purchase' && t.itemDetails) {
            logs.push({ username: entry.key[1] as string, itemName: t.itemName, itemDetails: t.itemDetails, timestamp: t.timestamp, amount: t.amount });
        }
    }
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function getAdminTopupHistory(searchTerm: string = ''): Promise<Transaction[]> {
    const term = searchTerm.toLowerCase();
    const entries = kv.list<Transaction>({ prefix: ["transactions"] });
    const logs: Transaction[] = [];
    for await (const entry of entries) {
        const t = entry.value;
        const isAdminCredit = t.itemName && (t.itemName.includes('Admin Top-Up') || t.itemName.includes('Voucher:') || t.itemName.includes('ROLLBACK'));
        if (t.type === 'topup' && isAdminCredit) {
            const displayItemName = `${t.itemName} to ${entry.key[1]}`;
            if (term === '' || displayItemName.toLowerCase().includes(term)) logs.push({ ...t, itemName: displayItemName });
        }
    }
    return logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
}

export async function handleRefundRollback(username: string, timestamp: string, adminUsername: string): Promise<string> {
    const key = ["transactions", username, timestamp];
    const result = await kv.get<Transaction>(key);
    if (!result.value) return "Transaction not found.";
    const t = result.value;
    if (t.isRolledBack) return "Already rolled back.";

    const originalAmount = Math.abs(t.amount);
    const rollbackAmount = t.type === "purchase" ? originalAmount : -originalAmount;
    const rollbackType = rollbackAmount > 0 ? "topup" : "purchase";
    
    if (!await updateUserBalance(username, rollbackAmount)) return "Failed to update balance.";
    
    await logTransaction(username, rollbackAmount, rollbackType, `ROLLBACK/${t.type.toUpperCase()} by Admin ${adminUsername}`);
    if (t.type === 'purchase') await updateUserSpendAndTier(username, -originalAmount);

    t.isRolledBack = true;
    await kv.atomic().check(result).set(key, t).commit();
    return `Reversed. ${formatCurrency(Math.abs(rollbackAmount))} Ks processed.`;
}

export async function transferBalance(sender: string, recipient: string, amount: number): Promise<string> {
    if (sender === recipient) return "Cannot send to yourself.";
    if (amount <= 0) return "Amount must be positive.";

    const senderKey = ["users", sender];
    const recipientKey = ["users", recipient];
    
    while(true) {
        const [sRes, rRes] = await kv.getMany<[User, User]>([senderKey, recipientKey]);
        if (!sRes.value) return "Sender not found.";
        if (!rRes.value) return "Recipient not found.";
        if (sRes.value.isBlocked || rRes.value.isBlocked) return "Account suspended.";
        if (sRes.value.balance < amount) return "Insufficient balance.";

        const sTx: Transaction = { type: "purchase", amount: -amount, timestamp: new Date().toISOString(), itemName: `Transfer to ${recipient}` };
        const rTx: Transaction = { type: "topup", amount: amount, timestamp: new Date(Date.now()+1).toISOString(), itemName: `Transfer from ${sender}` };

        const res = await kv.atomic()
            .check(sRes).check(rRes)
            .set(senderKey, { ...sRes.value, balance: sRes.value.balance - amount })
            .set(recipientKey, { ...rRes.value, balance: rRes.value.balance + amount })
            .set(["transactions", sender, sTx.timestamp], sTx)
            .set(["transactions", recipient, rTx.timestamp], rTx)
            .commit();
        
        if (res.ok) {
            await updateUserSpendAndTier(sender, amount);
            return "success";
        }
    }
}

export async function deleteAllUsersAndRelatedData(): Promise<string> {
    const entries = kv.list({ prefix: ["users"] });
    let count = 0;
    for await (const entry of entries) {
        const username = entry.key[1] as string;
        const txs = kv.list({ prefix: ["transactions", username] });
        for await (const tx of txs) await kv.delete(tx.key);
        await kv.delete(entry.key);
        count++;
    }
    return `Deleted ${count} users.`;
}

// --- Product & Voucher ---
export async function getProducts(): Promise<Product[]> {
    const entries = kv.list<Product>({ prefix: ["products"] });
    const products: Product[] = [];
    for await (const entry of entries) products.push(entry.value);
    return products.sort((a, b) => parseInt(a.id) - parseInt(b.id));
}

export async function getProductById(id: string) {
    return await kv.get<Product>(["products", id]);
}

export async function addOrUpdateProduct(product: Product): Promise<boolean> {
    return (await kv.set(["products", product.id], product)).ok;
}

export async function deleteProduct(id: string): Promise<void> {
    await kv.delete(["products", id]);
}

export async function generateVoucher(value: number): Promise<void> {
    const code = `SHOP-${Date.now().toString().slice(-6)}`;
    const voucher: Voucher = { code, value, isUsed: false, generatedAt: new Date().toISOString() };
    await kv.set(["vouchers", code], voucher);
}

export async function getVoucherByCode(code: string) {
    return await kv.get<Voucher>(["vouchers", code.toUpperCase()]);
}

export async function getUnusedVouchers(): Promise<Voucher[]> {
    const entries = kv.list<Voucher>({ prefix: ["vouchers"] });
    const vouchers: Voucher[] = [];
    for await (const entry of entries) if (!entry.value.isUsed) vouchers.push(entry.value);
    return vouchers;
}

export async function markVoucherUsed(result: Deno.KvEntry<Voucher>): Promise<boolean> {
    return (await kv.atomic().check(result).set(result.key, { ...result.value, isUsed: true }).commit()).ok;
}

// --- Misc ---
export async function getAnnouncement(): Promise<string | null> {
    return (await kv.get<Announcement>(["site_announcement"])).value?.message || null;
}
export async function setAnnouncement(message: string): Promise<void> {
    const key = ["site_announcement"];
    message.trim() === "" ? await kv.delete(key) : await kv.set(key, { message });
}

export async function getPaymentInfo(): Promise<PaymentInfo | null> {
    return (await kv.get<PaymentInfo>(["payment_info"])).value;
}
export async function setPaymentInfo(info: PaymentInfo): Promise<void> {
    await kv.set(["payment_info"], info);
}

export async function getGlobalBonus(): Promise<GlobalBonus | null> {
    return (await kv.get<GlobalBonus>(["global_bonus"])).value;
}
export async function setGlobalBonus(amount: number): Promise<void> {
    const key = ["global_bonus"];
    const bonus = { amount, isActive: amount > 0 };
    await kv.set(key, bonus);
    if (bonus.isActive) {
        const users = kv.list<User>({ prefix: ["users"] });
        for await (const u of users) if (u.value.receivedBonus) await kv.set(u.key, { ...u.value, receivedBonus: false });
    }
}

export async function createSession(username: string, remember: boolean): Promise<string> {
    const token = crypto.randomUUID();
    const expireIn = remember ? 1000 * 60 * 60 * 24 * 30 : 1000 * 60 * 60;
    await kv.set(["sessions", token], username, { expireIn });
    return token;
}
export async function getUsernameFromSession(token: string): Promise<string | null> {
    return (await kv.get<string>(["sessions", token])).value;
}
export async function deleteSession(token: string): Promise<void> {
    await kv.delete(["sessions", token]);
}
