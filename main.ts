import { Hono } from "jsr:@hono/hono";
import { getCookie, setCookie, deleteCookie } from "jsr:@hono/hono/cookie";
import { kv, User, Product, Transaction, getUser, getProduct, addHistory, isKeySold, markKeyAsSold, getConfig, setConfig } from "./db.ts";
import { Layout, AuthForm, ProductCard, HistoryTable, MaintenancePage } from "./ui.ts";

const app = new Hono();

async function getApiAvailableStock(p: Product): Promise<number | string> {
    if (!p.apiUrl) return 0;
    try {
        const res = await fetch(p.apiUrl);
        if (!res.ok) return "?";
        const text = await res.text();
        const json = JSON.parse(text);
        const items = Array.isArray(json) ? json : [json];
        let count = 0;
        for (const item of items) {
            const expDate = new Date(item.expiration_date);
            const now = new Date();
            now.setHours(0,0,0,0);
            if (expDate < now) continue;
            if (item.android_id_1 && item.android_id_1.trim() !== "" && item.android_id_2 && item.android_id_2.trim() !== "") continue;
            if (await isKeySold(item.key)) continue; 
            count++;
        }
        return count;
    } catch {
        return "?";
    }
}

async function getSessionUser(c: any) {
  const sessionUser = getCookie(c, "session_user");
  if (!sessionUser) return null;
  return await getUser(sessionUser);
}

// --- Routes ---

app.get("/", async (c) => {
  const user = await getSessionUser(c);
  const config = await getConfig();

  // MAINTENANCE CHECK
  // If maintenance is ON and user is NOT admin, show maintenance page
  if (config.maintenance && (!user || !user.isAdmin)) {
      return c.html(MaintenancePage());
  }

  if (!user) return c.redirect("/login");
  
  const iter = kv.list<Product>({ prefix: ["products"] });
  let productsHtml = "";
  for await (const entry of iter) { productsHtml += ProductCard(entry.value); }

  return c.html(Layout("Shop", `
    ${config.maintenance ? '<div class="bg-red-600 text-white text-center py-1 mb-4 rounded font-bold">⚠️ Maintenance Mode Active (Only Admin can see this)</div>' : ''}
    <div class="flex flex-col md:flex-row justify-between items-center mb-6 gap-4">
        <h1 class="text-3xl font-bold text-white">Products</h1>
        <div class="relative w-full md:w-64">
            <input type="text" id="searchInput" onkeyup="filterProducts()" placeholder="Search products..." class="w-full bg-slate-800 border border-slate-700 text-white px-4 py-2 rounded-lg focus:ring-2 focus:ring-blue-500 outline-none pl-10">
            <div class="absolute left-3 top-2.5 text-slate-400">🔍</div>
        </div>
    </div>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      ${productsHtml || '<p class="text-slate-500 col-span-full text-center">No products available yet.</p>'}
    </div>
  `, user, config.banner));
});

app.get("/deposit", async (c) => {
    const user = await getSessionUser(c);
    if (!user) return c.redirect("/login");
    const config = await getConfig();
    if (config.maintenance && !user.isAdmin) return c.html(MaintenancePage());

    return c.html(Layout("Deposit", `
        <div class="max-w-xl mx-auto">
            <div class="glass rounded-2xl p-8 border border-blue-500/30">
                <h1 class="text-3xl font-bold text-white mb-2 text-center">💰 Top Up Balance</h1>
                <p class="text-slate-400 text-center mb-8">ငွေဖြည့်ရန် အောက်ပါအကောင့်များသို့ ငွေလွှဲပါ။</p>
                <div class="bg-slate-900/50 rounded-xl p-6 mb-8 border border-slate-700"><pre class="font-mono text-slate-200 whitespace-pre-wrap leading-loose text-center">${config.payment}</pre></div>
                <div class="text-center"><p class="text-slate-400 text-sm mb-4">ငွေလွှဲပြီးပါက Admin ထံ Screenshot ပေးပို့ပါ။</p><a href="https://t.me/${config.telegram}" target="_blank" class="inline-flex items-center gap-2 bg-blue-500 hover:bg-blue-400 text-white font-bold py-3 px-8 rounded-full transition shadow-lg shadow-blue-500/30"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z"/></svg>Send Screenshot</a></div>
            </div>
            <div class="mt-6 text-center"><a href="/" class="text-slate-500 hover:text-white">Cancel</a></div>
        </div>
    `, user));
});

app.get("/check-stock", async (c) => {
    const id = c.req.query("id");
    if(!id) return c.text("?");
    const p = await getProduct(id);
    if(!p || p.type !== 'api') return c.text("?");
    const count = await getApiAvailableStock(p);
    return c.text(String(count));
});

app.get("/history", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.redirect("/login");
  const cursor = c.req.query("cursor");
  const iter = kv.list<Transaction>({ prefix: ["history", user.username] }, { limit: 10, reverse: true, cursor: cursor });
  const transactions: Transaction[] = [];
  let nextCursor = null;
  for await (const entry of iter) { transactions.push(entry.value); nextCursor = entry.key; }
  if (transactions.length < 10) nextCursor = null; 
  const encodedCursor = nextCursor ? btoa(JSON.stringify(nextCursor)) : null;
  return c.html(Layout("History", `
    <div class="max-w-4xl mx-auto">
        <h1 class="text-3xl font-bold text-white mb-6">Transaction History</h1>
        ${HistoryTable(transactions, encodedCursor)}
        <div class="mt-4 text-center text-slate-500 text-sm"><a href="/" class="hover:text-blue-400">← Back to Shop</a></div>
    </div>
  `, user));
});

app.get("/login", (c) => c.html(Layout("Login", AuthForm("Login"))));
app.post("/login", async (c) => {
  const { username, password } = await c.req.parseBody();
  const user = await getUser(username as string);
  if (user && user.password === password) { setCookie(c, "session_user", user.username); return c.redirect("/"); }
  return c.html(Layout("Login", AuthForm("Login", "Invalid username or password")));
});

app.get("/register", async (c) => {
    const config = await getConfig();
    if (config.noReg) return c.html(Layout("Registration Closed", `<div class="text-center py-10 text-red-400 text-xl font-bold">⚠️ New registrations are currently disabled.</div>`));
    return c.html(Layout("Register", AuthForm("Register")));
});
app.post("/register", async (c) => {
  const config = await getConfig();
  if (config.noReg) return c.html(Layout("Registration Closed", `<div class="text-center py-10 text-red-400 text-xl font-bold">⚠️ New registrations are currently disabled.</div>`));
  
  const { username, password } = await c.req.parseBody();
  const existing = await getUser(username as string);
  if (existing) return c.html(Layout("Register", AuthForm("Register", "Username already taken")));
  const list = kv.list({ prefix: ["users"] }, { limit: 1 });
  const isFirst = (await list.next()).done;
  await kv.set(["users", username as string], { username, password, balance: 0, isAdmin: isFirst } as User);
  setCookie(c, "session_user", username as string);
  return c.redirect("/");
});
app.get("/logout", (c) => { deleteCookie(c, "session_user"); return c.redirect("/login"); });

app.post("/buy", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.redirect("/login");
  const config = await getConfig();
  if (config.maintenance && !user.isAdmin) return c.html(MaintenancePage());

  const { id } = await c.req.parseBody();
  const product = await getProduct(id as string);
  if (!product) return c.redirect("/");
  if (user.balance < product.price) {
    return c.html(Layout("Error", `<div class="max-w-md mx-auto glass p-8 rounded-xl text-center"><h2 class="text-red-400 text-xl font-bold mb-4">Insufficient Balance</h2><a href="/deposit" class="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-500">Top Up Now</a></div>`, user));
  }
  let finalDisplayCode = "";
  let soldKeyIdentifier = null; 
  if (product.type === "manual") {
    if (!product.stock.length) return c.html(Layout("Error", "Out of Stock", user));
    finalDisplayCode = product.stock[0];
    const res = await kv.atomic().check(await kv.get(["products", product.id])).check(await kv.get(["users", user.username])).set(["products", product.id], { ...product, stock: product.stock.slice(1) }).set(["users", user.username], { ...user, balance: user.balance - product.price }).commit();
    if(!res.ok) return c.html(Layout("Error", "Transaction Failed. Try Again.", user));
  } else {
    try {
      const res = await fetch(product.apiUrl!);
      const text = await res.text();
      let json;
      try {
        json = JSON.parse(text);
        const items = Array.isArray(json) ? json : [json];
        let validItem = null;
        for (const item of items) {
            const expDate = new Date(item.expiration_date);
            const now = new Date();
            now.setHours(0,0,0,0); 
            if (expDate < now) continue;
            if (item.android_id_1 && item.android_id_1.trim() !== "" && item.android_id_2 && item.android_id_2.trim() !== "") continue;
            if (await isKeySold(item.key)) continue;
            validItem = item;
            break;
        }
        if (!validItem) return c.html(Layout("Error", `<div class="max-w-md mx-auto glass p-8 rounded-xl text-center"><h2 class="text-red-400 text-xl font-bold mb-4">Stock Unavailable</h2><p class="text-slate-300">All valid keys have been sold or are full.</p><a href="/" class="text-blue-400 mt-4 inline-block">Back</a></div>`, user));
        finalDisplayCode = `Key: ${validItem.key}\nExpires: ${validItem.expiration_date}`;
        soldKeyIdentifier = validItem.key;
      } catch (e) { finalDisplayCode = text; }
      const resKv = await kv.atomic().check(await kv.get(["users", user.username])).set(["users", user.username], { ...user, balance: user.balance - product.price }).commit();
      if(!resKv.ok) throw new Error();
      if (soldKeyIdentifier) await markKeyAsSold(soldKeyIdentifier, user.username);
    } catch { return c.html(Layout("Error", "API Error", user)); }
  }
  await addHistory(user.username, "purchase", product.name, product.price, finalDisplayCode);
  return c.html(Layout("Success", `
    <div class="max-w-lg mx-auto glass rounded-2xl overflow-hidden border border-green-500/30 shadow-2xl shadow-green-500/10">
      <div class="bg-green-600/20 p-6 text-center border-b border-green-500/30"><div class="text-5xl mb-4">🎉</div><h2 class="text-2xl font-bold text-green-400 mb-1">Purchase Successful!</h2></div>
      <div class="p-8 bg-[#0b1120]"><p class="text-slate-400 text-sm mb-3 uppercase tracking-wider font-semibold">Your Item:</p><div class="code-box bg-slate-900 border-2 border-dashed border-slate-600 rounded-xl p-4 relative group"><pre class="font-mono text-green-400 whitespace-pre-wrap break-all text-lg leading-relaxed shadow-inner">${finalDisplayCode}</pre></div><div class="mt-6 flex gap-3"><button id="copyBtn" onclick="copyToClipboard(\`${finalDisplayCode.replace(/`/g, "\\`")}\`)" class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-xl transition flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20">Copy Code</button><a href="/" class="flex-1 bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 rounded-xl text-center transition border border-slate-600">Return</a></div></div>
    </div>
  `, { ...user, balance: user.balance - product.price }));
});

// Admin Routes
app.get("/admin", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.isAdmin) return c.redirect("/");
  const prodIter = kv.list<Product>({ prefix: ["products"] });
  let prodRows = "";
  for await (const { value: p } of prodIter) {
    const stockDisplay = p.type === 'manual' ? p.stock.length : 'Auto (API)';
    prodRows += `<tr class="border-b border-slate-700 hover:bg-slate-800"><td class="p-3">${p.name}</td><td class="p-3">${p.price.toLocaleString()} Ks</td><td class="p-3">${stockDisplay}</td><td class="p-3 flex gap-2"><a href="/admin/edit?id=${p.id}" class="text-yellow-400 hover:underline">Edit</a><form action="/admin/delete" method="POST" onsubmit="return confirm('Are you sure?')" style="margin:0;"><input type="hidden" name="id" value="${p.id}"><button class="text-red-400 hover:underline">Delete</button></form></td></tr>`;
  }
  const userIter = kv.list<User>({ prefix: ["users"] });
  let userListHtml = "";
  for await (const { value: u } of userIter) { if (u.username !== user.username) { userListHtml += `<div class="flex justify-between items-center border-b border-slate-700 py-2 text-sm"><span class="text-slate-300 select-all cursor-pointer" onclick="document.querySelector('input[name=username]').value = '${u.username}'">${u.username}</span><span class="text-green-400">${u.balance.toLocaleString()} Ks</span></div>`; } }

  const config = await getConfig();

  return c.html(Layout("Admin", `
    <div class="grid lg:grid-cols-3 gap-8">
      <div class="lg:col-span-1 space-y-6">
        <div class="glass p-6 rounded-xl border-l-4 border-yellow-500 space-y-4">
            <h3 class="text-xl font-bold text-white">⚙️ Configuration</h3>
            <form action="/admin/config" method="POST" class="space-y-3">
                <div class="grid grid-cols-2 gap-2">
                    <label class="flex items-center space-x-2 cursor-pointer bg-slate-800 p-2 rounded border ${config.maintenance ? 'border-red-500' : 'border-slate-600'}">
                        <input type="checkbox" name="maintenance" ${config.maintenance ? 'checked' : ''}>
                        <span class="text-xs text-white">Maintenance Mode</span>
                    </label>
                    <label class="flex items-center space-x-2 cursor-pointer bg-slate-800 p-2 rounded border ${config.noReg ? 'border-red-500' : 'border-slate-600'}">
                        <input type="checkbox" name="noReg" ${config.noReg ? 'checked' : ''}>
                        <span class="text-xs text-white">Disable Register</span>
                    </label>
                </div>
                <div><label class="text-xs text-slate-400 uppercase">Announcement</label><input name="banner" value="${config.banner}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"></div>
                <div><label class="text-xs text-slate-400 uppercase">Telegram (No @)</label><input name="telegram" value="${config.telegram}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm"></div>
                <div><label class="text-xs text-slate-400 uppercase">Payment Details</label><textarea name="payment" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white text-sm h-20">${config.payment}</textarea></div>
                <button class="bg-yellow-600 hover:bg-yellow-500 text-white px-4 py-2 rounded font-bold w-full">Update Settings</button>
            </form>
        </div>

        <div class="glass p-6 rounded-xl"><h3 class="text-xl font-bold text-white mb-4">💰 User Top Up</h3><form action="/admin/topup" method="POST" class="space-y-3"><input name="username" placeholder="Username" required class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"><div class="flex gap-2"><input name="amount" type="number" placeholder="Amount" required class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"><button class="bg-blue-600 px-4 rounded text-white font-bold">Add</button></div></form></div>
        <div class="glass p-6 rounded-xl"><h3 class="text-lg font-bold text-white mb-2">👥 Registered Users</h3><div class="max-h-64 overflow-y-auto pr-2">${userListHtml || '<p class="text-slate-500">No other users yet</p>'}</div></div>
      </div>
      <div class="lg:col-span-2 space-y-8">
        <div class="glass p-6 rounded-xl"><h3 class="text-xl font-bold text-white mb-4">➕ Add Product</h3><form action="/admin/add" method="POST" class="space-y-3"><div class="grid grid-cols-2 gap-4"><input name="name" placeholder="Name" required class="bg-slate-800 border border-slate-600 rounded p-2 text-white"><input name="price" type="number" placeholder="Price" required class="bg-slate-800 border border-slate-600 rounded p-2 text-white"></div><input name="desc" placeholder="Description" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"><select name="type" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"><option value="manual">Manual Stock</option><option value="api">API Link</option></select><textarea name="data" placeholder="Codes (Manual) or URL (API)" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white h-20"></textarea><button class="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded">Add Product</button></form></div>
        <div class="glass p-6 rounded-xl overflow-x-auto"><h3 class="text-xl font-bold text-white mb-4">📦 Inventory</h3><table class="w-full text-left text-slate-300 text-sm"><thead class="bg-slate-700 text-white uppercase"><tr><th class="p-3">Name</th><th class="p-3">Price</th><th class="p-3">Stock</th><th class="p-3">Actions</th></tr></thead><tbody>${prodRows}</tbody></table></div>
      </div>
    </div>
  `, user));
});

app.post("/admin/config", async (c) => {
    const user = await getSessionUser(c);
    if (!user?.isAdmin) return c.redirect("/");
    const body = await c.req.parseBody();
    
    await setConfig("banner", body.banner as string);
    await setConfig("telegram", body.telegram as string);
    await setConfig("payment", body.payment as string);
    
    // Handle Checkboxes (if checked sends "on", if unchecked sends nothing)
    await setConfig("maintenance", body.maintenance === "on");
    await setConfig("no_reg", body.noReg === "on");

    return c.redirect("/admin");
});

app.post("/admin/topup", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const body = await c.req.parseBody(); const targetUsername = (body.username as string).trim(); const amount = Number(body.amount); const targetUser = await getUser(targetUsername); if (!targetUser) return c.html(Layout("Admin Error", "User Not Found", user)); await kv.set(["users", targetUsername], { ...targetUser, balance: targetUser.balance + amount }); await addHistory(targetUsername, "topup", "Admin Topup", amount, `Added by Admin`); return c.redirect("/admin"); });
app.post("/admin/add", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const body = await c.req.parseBody(); const p: Product = { id: crypto.randomUUID(), name: body.name as string, description: body.desc as string, price: Number(body.price), type: body.type as any, stock: body.type === 'manual' ? (body.data as string).split("\n").map(s=>s.trim()).filter(Boolean) : [], apiUrl: body.type === 'api' ? (body.data as string).trim() : undefined }; await kv.set(["products", p.id], p); return c.redirect("/admin"); });
app.post("/admin/delete", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const { id } = await c.req.parseBody(); await kv.delete(["products", id as string]); return c.redirect("/admin"); });
app.get("/admin/edit", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const id = c.req.query("id"); const p = await getProduct(id!); if (!p) return c.redirect("/admin"); return c.html(Layout("Edit", `<div class="max-w-lg mx-auto glass p-8 rounded-xl"><h2 class="text-2xl font-bold text-white mb-6">Edit Product</h2><form action="/admin/update" method="POST" class="space-y-4"><input type="hidden" name="id" value="${p.id}"><div><label class="text-slate-400 block mb-1">Name</label><input name="name" value="${p.name}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"></div><div><label class="text-slate-400 block mb-1">Price</label><input name="price" type="number" value="${p.price}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"></div><div><label class="text-slate-400 block mb-1">Description</label><input name="desc" value="${p.description}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white"></div><div><label class="text-slate-400 block mb-1">Data</label><textarea name="data" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white h-32">${p.type === 'manual' ? p.stock.join("\n") : p.apiUrl}</textarea></div><div class="flex gap-4 pt-4"><button class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded">Update</button><a href="/admin" class="flex-1 bg-slate-700 text-center py-2 rounded text-white">Cancel</a></div></form></div>`, user)); });
app.post("/admin/update", async (c) => { const user = await getSessionUser(c); if (!user?.isAdmin) return c.redirect("/"); const body = await c.req.parseBody(); const p = await getProduct(body.id as string); if (p) { const updated: Product = { ...p, name: body.name as string, price: Number(body.price), description: body.desc as string, stock: p.type === 'manual' ? (body.data as string).split("\n").map(s=>s.trim()).filter(Boolean) : [], apiUrl: p.type === 'api' ? (body.data as string).trim() : undefined }; await kv.set(["products", p.id], updated); } return c.redirect("/admin"); });

Deno.serve(app.fetch);
