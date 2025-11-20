import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { setCookie, getCookies, deleteCookie } from "https://deno.land/std@0.224.0/http/cookie.ts";

const kv = await Deno.openKv();
const ADMIN_USERNAME = "admin"; 

// --- NATIVE HASHING HELPERS ---

function bufferToHex(buffer: ArrayBuffer): string {
    return Array.from(new Uint8Array(buffer)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function generateSalt(): string {
    const salt = new Uint8Array(16);
    crypto.getRandomValues(salt);
    return bufferToHex(salt.buffer);
}

async function hashPassword(password: string): Promise<{hash: string, salt: string}> {
    const salt = generateSalt();
    const data = new TextEncoder().encode(password + salt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    return { hash: bufferToHex(hashBuffer), salt: salt };
}

async function verifyPassword(password: string, storedHash: string, storedSalt: string): Promise<boolean> {
    const data = new TextEncoder().encode(password + storedSalt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const newHash = bufferToHex(hashBuffer);
    return newHash === storedHash;
}

// --- MAIN SERVER LOGIC ---

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const cookies = getCookies(req.headers);
  const sessionUser = cookies.user_session || null;

  // SECURITY & ADMIN CHECK
  if (url.pathname === "/admin" || url.pathname.startsWith("/static/admin.html")) {
    if (sessionUser !== ADMIN_USERNAME) return new Response("Access Denied: Admins Only", { status: 403 });
  }
  if (url.pathname.startsWith("/api/admin/")) {
    if (sessionUser !== ADMIN_USERNAME) return new Response("Unauthorized", { status: 403 });
  }

  // --- API: DATABASE INTEGRITY TEST (TEMPORARY) ---
  if (url.pathname === "/debug_kv_write_test") {
    const u = "testuser_a3b2c";
    
    try {
        const check = await kv.get(["users", u]);
        
        if (check.value) {
            return new Response(`SUCCESS: Test user '${u}' already exists in DB. Login is possible.`, { status: 200 });
        }

        // Try to register a new user
        const { hash, salt } = await hashPassword("password");
        await kv.set(["users", u], { username: u, hash: hash, salt: salt, balance: 0 });

        const finalCheck = await kv.get(["users", u]);
        
        if (finalCheck.value) {
            return new Response(`SUCCESS: New Test User Created and Found in DB.`, { status: 200 });
        } else {
            return new Response("FAILURE: User Created but not found on read.", { status: 500 });
        }

    } catch (e) {
        return new Response(`CRITICAL ERROR: ${e.message}`, { status: 500 });
    }
  }


  // ROUTING
  if (url.pathname === "/login") return serveFile(req, "./static/login.html");
  if (!sessionUser && (url.pathname === "/" || url.pathname === "/admin" || url.pathname === "/profile")) {
    return new Response(null, { status: 302, headers: { Location: "/login" } });
  }

  if (url.pathname === "/") return serveFile(req, "./static/shop.html"); // Serves the new shop file
  if (url.pathname === "/admin") return serveFile(req, "./static/admin.html");
  if (url.pathname === "/profile") return serveFile(req, "./static/profile.html");
  if (url.pathname.startsWith("/static/")) return serveFile(req, "." + url.pathname);

  // --- API: AUTH ---
  if (req.method === "POST" && url.pathname.includes("/api/auth/register")) {
    const body = await req.json();
    const u = body.username.toLowerCase();
    const check = await kv.get(["users", u]);
    if (check.value) return new Response("Exists", { status: 400 });

    const { hash, salt } = await hashPassword(body.password);
    await kv.set(["users", u], { username: u, hash: hash, salt: salt, balance: 0 });
    return new Response("Created");
  }

  if (req.method === "POST" && url.pathname.includes("/api/auth/login")) {
    const body = await req.json();
    const u = body.username.toLowerCase();
    const userRes = await kv.get(["users", u]);
    const user = userRes.value;

    if (!user) return new Response("Fail", { status: 401 });

    const passwordMatch = await verifyPassword(body.password, user.hash, user.salt);
    if (!passwordMatch) return new Response("Fail", { status: 401 });

    const res = new Response("Logged In");
    setCookie(res.headers, { name: "user_session", value: u, path: "/", maxAge: 86400 });
    return res;
  }

  if (url.pathname === "/api/auth/logout") {
    const res = new Response(null, { status: 302, headers: { Location: "/login" } });
    deleteCookie(res.headers, "user_session");
    return res;
  }

  if (url.pathname === "/api/me") {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const user = await kv.get(["users", sessionUser]);
    return new Response(JSON.stringify(user.value), { headers: { "content-type": "application/json" } });
  }

  if (req.method === "POST" && url.pathname.includes("/api/auth/change-password")) {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const body = await req.json();
    const { old_password, new_password } = body;

    const userRes = await kv.get(["users", sessionUser]);
    const user = userRes.value;
    
    const match = await verifyPassword(old_password, user.hash, user.salt);
    if (!match) return new Response("Incorrect old password", { status: 401 });

    const { hash, salt } = await hashPassword(new_password);
    user.hash = hash;
    user.salt = salt;
    
    await kv.set(["users", sessionUser], user);
    return new Response("Password changed successfully");
  }
  
  // --- REST OF SHOP & ADMIN API ---

  if (url.pathname.startsWith("/api/items")) {
    const entries = kv.list({ prefix: ["items"] });
    const items = [];
    for await (const entry of entries) {
        const itemCopy = { ...entry.value };
        itemCopy.stock = itemCopy.stock ? itemCopy.stock.length : 0; 
        items.push(itemCopy);
    }
    return new Response(JSON.stringify(items), { headers: { "content-type": "application/json" } });
  }

  if (url.pathname.includes("/api/admin/users")) {
    const entries = kv.list({ prefix: ["users"] });
    const users = [];
    for await (const entry of entries) users.push(entry.value);
    return new Response(JSON.stringify(users), { headers: { "content-type": "application/json" } });
  }

  if (req.method === "POST" && url.pathname.includes("/api/add-item")) {
    const item = await req.json();
    const id = item.name.replace(/\s+/g, '_').toLowerCase();
    await kv.set(["items", id], item);
    return new Response("Added");
  }

  if (req.method === "POST" && url.pathname.includes("/api/admin/topup")) {
    const body = await req.json();
    const u = body.username.toLowerCase();
    const userRes = await kv.get(["users", u]);
    if (!userRes.value) return new Response("User not found", { status: 404 });
    const user = userRes.value;
    user.balance += parseInt(body.amount);
    await kv.set(["users", u], user);
    return new Response("Topup Success");
  }
  
  if (req.method === "POST" && url.pathname.includes("/api/admin/create-voucher")) {
    const body = await req.json();
    await kv.set(["vouchers", body.code], { amount: parseInt(body.amount), limit: parseInt(body.limit), used: 0 });
    return new Response("Voucher Created");
  }

  if (req.method === "POST" && url.pathname.includes("/api/transfer")) {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const body = await req.json();
    const receiverName = body.receiver.toLowerCase();
    const amount = parseInt(body.amount);

    if (receiverName === sessionUser) return new Response("Cannot send to self", { status: 400 });
    if (amount <= 0) return new Response("Invalid amount", { status: 400 });

    const senderRes = await kv.get(["users", sessionUser]);
    const sender = senderRes.value;
    if (sender.balance < amount) return new Response("Insufficient Balance", { status: 400 });

    const receiverRes = await kv.get(["users", receiverName]);
    if (!receiverRes.value) return new Response("Receiver not found", { status: 404 });
    const receiver = receiverRes.value;

    sender.balance -= amount;
    receiver.balance += amount;

    await kv.set(["users", sessionUser], sender);
    await kv.set(["users", receiverName], receiver);

    return new Response("Transfer Success");
  }
  
  if (req.method === "POST" && url.pathname.includes("/api/redeem")) {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const body = await req.json();
    const code = body.code;

    const voucherRes = await kv.get(["vouchers", code]);
    if (!voucherRes.value) return new Response("Invalid Voucher", { status: 404 });
    
    const voucher = voucherRes.value;
    if (voucher.used >= voucher.limit) return new Response("Voucher Fully Used", { status: 400 });

    const userRes = await kv.get(["users", sessionUser]);
    const user = userRes.value;
    user.balance += voucher.amount;
    
    voucher.used += 1;

    await kv.set(["users", sessionUser], user);
    await kv.set(["vouchers", code], voucher);

    return new Response(JSON.stringify({ amount: voucher.amount }), { headers: { "content-type": "application/json" } });
  }

  if (req.method === "POST" && url.pathname.includes("/api/buy")) {
    if (!sessionUser) return new Response(JSON.stringify({ error: "Login Required" }), { status: 401 });

    const body = await req.json();
    const itemId = body.itemName.replace(/\s+/g, '_').toLowerCase();
    
    const itemRes = await kv.get(["items", itemId]);
    if (!itemRes.value) return new Response(JSON.stringify({ error: "Item not found" }), { status: 404 });
    let item = itemRes.value;

    if (item.stock.length === 0) return new Response(JSON.stringify({ error: "Out of Stock!" }), { status: 400 });

    const userRes = await kv.get(["users", sessionUser]);
    let user = userRes.value;
    const price = parseInt(item.price.replace(/[^0-9]/g, ''));

    if (user.balance < price) return new Response(JSON.stringify({ error: "Insufficient Balance" }), { status: 400 });

    const purchasedCode = item.stock[0];
    item.stock = item.stock.slice(1);
    user.balance -= price;

    await kv.set(["items", itemId], item);
    await kv.set(["users", sessionUser], user);

    const record = {
      itemName: item.name,
      code: purchasedCode,
      price: item.price,
      date: new Date().toLocaleString()
    };
    await kv.set(["history", sessionUser, Date.now()], record);

    return new Response(JSON.stringify({ success: true, code: purchasedCode }), { headers: { "content-type": "application/json" } });
  }
  
  if (url.pathname.includes("/api/history")) {
    if (!sessionUser) return new Response("Unauthorized", { status: 401 });
    const entries = kv.list({ prefix: ["history", sessionUser] });
    const history = [];
    for await (const entry of entries) history.push(entry.value);
    return new Response(JSON.stringify(history.reverse()), { headers: { "content-type": "application/json" } });
  }

  return new Response("Not Found", { status: 404 });
});
