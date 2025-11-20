export const kv = await Deno.openKv();

export interface User {
  username: string;
  password: string;
  balance: number;
  isAdmin: boolean;
  avatar?: string;
  isBlocked?: boolean;
  hasClaimedBonus?: boolean;
  createdAt?: number;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  type: "manual" | "api";
  stock: string[]; 
  apiUrl?: string;
  imageUrl?: string;
}

export interface Transaction {
  id: string;
  type: "purchase" | "topup" | "voucher" | "bonus" | "transfer_sent" | "transfer_received" | "refund"; // Added refund
  itemName: string;
  amount: number;
  detail: string;
  date: number;
  refunded?: boolean; // Track if this tx was refunded
}

export interface Voucher {
    code: string;
    amount: number;
    isUsed: boolean;
    usedBy?: string;
}

// New: Global Sale Record for Admin
export interface GlobalSale extends Transaction {
    username: string;
}

export async function getUser(username: string) {
  const res = await kv.get<User>(["users", username]);
  return res.value;
}

export async function updateUser(user: User) {
    await kv.set(["users", user.username], user);
}

export async function getProduct(id: string) {
  const res = await kv.get<Product>(["products", id]);
  return res.value;
}

// Updated to return the Transaction object
export async function addHistory(username: string, type: Transaction['type'], itemName: string, amount: number, detail: string) {
  const id = crypto.randomUUID();
  const transaction: Transaction = {
    id, type, itemName, amount, detail, date: Date.now()
  };
  await kv.set(["history", username, transaction.date, id], transaction);
  return transaction;
}

// New: Add to Global Sales List (For Admin)
export async function addGlobalSale(username: string, t: Transaction) {
    await kv.set(["global_sales", t.date, t.id], { ...t, username });
}

export async function isKeySold(key: string) {
  const res = await kv.get(["sold_keys", key]);
  return res.value !== null;
}

export async function markKeyAsSold(key: string, username: string) {
  await kv.set(["sold_keys", key], { soldTo: username, date: Date.now() });
}

export async function getConfig() {
    const banner = await kv.get<string>(["config", "banner"]);
    const payment = await kv.get<string>(["config", "payment"]);
    const telegram = await kv.get<string>(["config", "telegram"]);
    const maintenance = await kv.get<boolean>(["config", "maintenance"]);
    const noReg = await kv.get<boolean>(["config", "no_reg"]);
    const bonusActive = await kv.get<boolean>(["config", "bonus_active"]);
    const bonusAmount = await kv.get<number>(["config", "bonus_amount"]);
    
    return {
        banner: banner.value || "Welcome to GameStore!",
        payment: payment.value || "Kpay: 09xxxxxx\nWave: 09xxxxxx",
        telegram: telegram.value || "username",
        maintenance: maintenance.value ?? false,
        noReg: noReg.value ?? false,
        bonusActive: bonusActive.value ?? false,
        bonusAmount: bonusAmount.value || 0
    };
}

export async function setConfig(key: string, value: string | boolean | number) {
    await kv.set(["config", key], value);
}

export async function createVoucher(code: string, amount: number) {
    const voucher: Voucher = { code, amount, isUsed: false };
    await kv.set(["vouchers", code], voucher);
}

export async function getVoucher(code: string) {
    const res = await kv.get<Voucher>(["vouchers", code]);
    return res.value;
}

export async function markVoucherUsed(code: string, username: string) {
    const v = await getVoucher(code);
    if(v) {
        await kv.set(["vouchers", code], { ...v, isUsed: true, usedBy: username });
    }
}

// New: Refund Logic
export async function processRefund(username: string, date: number, txId: string) {
    const user = await getUser(username);
    const saleRes = await kv.get<GlobalSale>(["global_sales", date, txId]);
    const userTxRes = await kv.get<Transaction>(["history", username, date, txId]);

    if (!user || !saleRes.value || !userTxRes.value) return false;
    if (saleRes.value.refunded) return false; // Already refunded

    const amount = saleRes.value.amount;
    
    // Update DB
    const res = await kv.atomic()
        .set(["users", username], { ...user, balance: user.balance + amount }) // Refund Money
        .set(["global_sales", date, txId], { ...saleRes.value, refunded: true }) // Mark Global
        .set(["history", username, date, txId], { ...userTxRes.value, refunded: true }) // Mark User History
        .commit();
    
    if(res.ok) {
        // Add a "Refund Received" history entry
        await addHistory(username, "refund", `Refund: ${saleRes.value.itemName}`, amount, "Admin Refunded");
    }
    
    return res.ok;
}
