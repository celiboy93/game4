export const kv = await Deno.openKv();

export interface User {
  username: string;
  password: string;
  balance: number;
  isAdmin: boolean;
}

export interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  type: "manual" | "api";
  stock: string[]; 
  apiUrl?: string;
}

export interface Transaction {
  id: string;
  type: "purchase" | "topup";
  itemName: string;
  amount: number;
  detail: string;
  date: number;
}

export async function getUser(username: string) {
  const res = await kv.get<User>(["users", username]);
  return res.value;
}

export async function getProduct(id: string) {
  const res = await kv.get<Product>(["products", id]);
  return res.value;
}

export async function addHistory(username: string, type: "purchase" | "topup", itemName: string, amount: number, detail: string) {
  const id = crypto.randomUUID();
  const transaction: Transaction = {
    id, type, itemName, amount, detail, date: Date.now()
  };
  await kv.set(["history", username, Date.now(), id], transaction);
}

export async function isKeySold(key: string) {
  const res = await kv.get(["sold_keys", key]);
  return res.value !== null;
}

export async function markKeyAsSold(key: string, username: string) {
  await kv.set(["sold_keys", key], { soldTo: username, date: Date.now() });
}

// Config Helpers
export async function getConfig() {
    const banner = await kv.get<string>(["config", "banner"]);
    const payment = await kv.get<string>(["config", "payment"]); // Payment Details text
    const telegram = await kv.get<string>(["config", "telegram"]); // Telegram Username
    
    return {
        banner: banner.value || "Welcome to GameStore!",
        payment: payment.value || "Kpay: 09xxxxxx (Name)\nWave: 09xxxxxx (Name)",
        telegram: telegram.value || "username" // e.g., celiboy93 without @
    };
}

export async function setConfig(key: string, value: string) {
    await kv.set(["config", key], value);
}
