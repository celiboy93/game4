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

// New: Transaction History Structure
export interface Transaction {
  id: string;
  type: "purchase" | "topup";
  itemName: string; // Product Name or "Admin Topup"
  amount: number;
  detail: string;   // The Code/Key or Note
  date: number;     // Timestamp
}

export async function getUser(username: string) {
  const res = await kv.get<User>(["users", username]);
  return res.value;
}

export async function getProduct(id: string) {
  const res = await kv.get<Product>(["products", id]);
  return res.value;
}

// Helper to add history
export async function addHistory(username: string, type: "purchase" | "topup", itemName: string, amount: number, detail: string) {
  const id = crypto.randomUUID();
  const transaction: Transaction = {
    id, type, itemName, amount, detail, date: Date.now()
  };
  // Key structure: history > username > timestamp (descending via logic) > id
  await kv.set(["history", username, Date.now(), id], transaction);
}
