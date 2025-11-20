import { Hono } from "jsr:@hono/hono";
import { getCookie, setCookie, deleteCookie } from "jsr:@hono/hono/cookie";
import { kv, User, Product, getUser, getProduct } from "./db.ts";
import { Layout, AuthForm, ProductCard } from "./ui.ts";

const app = new Hono();

// --- Middleware ---
async function getSessionUser(c: any) {
  const sessionUser = getCookie(c, "session_user");
  if (!sessionUser) return null;
  return await getUser(sessionUser);
}

// --- Routes ---

// 1. Home / Shop
app.get("/", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.redirect("/login");

  const iter = kv.list<Product>({ prefix: ["products"] });
  let productsHtml = "";
  for await (const entry of iter) productsHtml += ProductCard(entry.value);

  return c.html(Layout("Shop", `
    <h1 class="text-3xl font-bold text-white mb-6">Products</h1>
    <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
      ${productsHtml || '<p class="text-slate-500 col-span-full text-center">No products available yet.</p>'}
    </div>
  `, user));
});

// 2. Login / Register
app.get("/login", (c) => c.html(Layout("Login", AuthForm("Login"))));
app.post("/login", async (c) => {
  const { username, password } = await c.req.parseBody();
  const user = await getUser(username as string);
  if (user && user.password === password) {
    setCookie(c, "session_user", user.username);
    return c.redirect("/");
  }
  return c.html(Layout("Login", AuthForm("Login", "Invalid username or password")));
});

app.get("/register", (c) => c.html(Layout("Register", AuthForm("Register"))));
app.post("/register", async (c) => {
  const { username, password } = await c.req.parseBody();
  const existing = await getUser(username as string);
  if (existing) return c.html(Layout("Register", AuthForm("Register", "Username already taken")));

  const list = kv.list({ prefix: ["users"] }, { limit: 1 });
  const isFirst = (await list.next()).done;

  await kv.set(["users", username as string], {
    username, password, balance: 0, isAdmin: isFirst
  } as User);
  
  setCookie(c, "session_user", username as string);
  return c.redirect("/");
});

app.get("/logout", (c) => {
  deleteCookie(c, "session_user");
  return c.redirect("/login");
});

// 3. Buy Action (Enhanced Logic)
app.post("/buy", async (c) => {
  const user = await getSessionUser(c);
  if (!user) return c.redirect("/login");
  const { id } = await c.req.parseBody();
  const product = await getProduct(id as string);

  if (!product) return c.redirect("/");
  
  // Initial Balance Check
  if (user.balance < product.price) {
    return c.html(Layout("Error", `<div class="max-w-md mx-auto glass p-8 rounded-xl text-center"><h2 class="text-red-400 text-xl font-bold mb-4">Insufficient Balance</h2><a href="/" class="text-blue-400">Back</a></div>`, user));
  }

  let finalDisplayCode = "";
  
  if (product.type === "manual") {
    if (!product.stock.length) return c.html(Layout("Error", "Out of Stock", user));
    finalDisplayCode = product.stock[0];
    
    const res = await kv.atomic()
      .check(await kv.get(["products", product.id]))
      .check(await kv.get(["users", user.username]))
      .set(["products", product.id], { ...product, stock: product.stock.slice(1) })
      .set(["users", user.username], { ...user, balance: user.balance - product.price })
      .commit();
    if(!res.ok) return c.html(Layout("Error", "Transaction Failed. Try Again.", user));

  } else {
    // --- API Logic with Filtering ---
    try {
      const res = await fetch(product.apiUrl!);
      const text = await res.text();
      let json;
      
      try {
        json = JSON.parse(text);
        
        // Support both single object and array of objects
        // If array, find the first valid one
        const items = Array.isArray(json) ? json : [json];
        let validItem = null;

        for (const item of items) {
            // 1. Check Expiration
            // Assuming date format YYYY-MM-DD
            const expDate = new Date(item.expiration_date);
            const now = new Date();
            // Reset time to midnight for fair comparison
            now.setHours(0,0,0,0); 

            if (expDate < now) {
                continue; // Expired, skip this item
            }

            // 2. Check Device IDs (Full logic)
            // If both ID_1 AND ID_2 have values, it is full.
            if (item.android_id_1 && item.android_id_1.trim() !== "" && 
                item.android_id_2 && item.android_id_2.trim() !== "") {
                continue; // Full, skip this item
            }

            // If passed checks
            validItem = item;
            break; // Found a good one, stop looking
        }

        if (!validItem) {
            // No valid items found in API response
            return c.html(Layout("Error", `
                <div class="max-w-md mx-auto glass p-8 rounded-xl text-center">
                    <h2 class="text-red-400 text-xl font-bold mb-4">Stock Unavailable</h2>
                    <p class="text-slate-300">The key from the server is either expired or full.</p>
                    <p class="text-slate-500 text-sm mt-2">Your balance was NOT deducted.</p>
                    <a href="/" class="text-blue-400 mt-4 inline-block">Back</a>
                </div>
            `, user));
        }

        // 3. Format Output (Only Key and Date)
        finalDisplayCode = `Key: ${validItem.key}\nExpires: ${validItem.expiration_date}`;

      } catch (e) {
        // Fallback if not JSON or parsing fails
        finalDisplayCode = text;
      }

      // Deduct Balance only if valid
      const resKv = await kv.atomic()
        .check(await kv.get(["users", user.username]))
        .set(["users", user.username], { ...user, balance: user.balance - product.price })
        .commit();
      if(!resKv.ok) throw new Error();

    } catch {
      return c.html(Layout("Error", "API Error: Link might be broken", user));
    }
  }

  return c.html(Layout("Success", `
    <div class="max-w-lg mx-auto glass p-8 rounded-xl text-center">
      <h2 class="text-green-400 text-2xl font-bold mb-4">🎉 Purchase Successful!</h2>
      <p class="text-slate-300 mb-2">Your Item:</p>
      <textarea readonly class="w-full bg-black text-green-400 font-mono p-4 rounded-lg h-32 mb-6">${finalDisplayCode}</textarea>
      <a href="/" class="bg-blue-600 text-white px-6 py-2 rounded-lg">Return to Shop</a>
    </div>
  `, { ...user, balance: user.balance - product.price }));
});

// 4. Admin Dashboard
app.get("/admin", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.isAdmin) return c.redirect("/");

  const prodIter = kv.list<Product>({ prefix: ["products"] });
  let prodRows = "";
  for await (const { value: p } of prodIter) {
    prodRows += `
      <tr class="border-b border-slate-700 hover:bg-slate-800">
        <td class="p-3">${p.name}</td>
        <td class="p-3">${p.price.toLocaleString()} Ks</td>
        <td class="p-3">${p.type === 'manual' ? p.stock.length : 'Auto'}</td>
        <td class="p-3 flex gap-2">
          <a href="/admin/edit?id=${p.id}" class="text-yellow-400 hover:underline">Edit</a>
          <form action="/admin/delete" method="POST" onsubmit="return confirm('Are you sure?')" style="margin:0;">
            <input type="hidden" name="id" value="${p.id}">
            <button class="text-red-400 hover:underline">Delete</button>
          </form>
        </td>
      </tr>`;
  }

  const userIter = kv.list<User>({ prefix: ["users"] });
  let userListHtml = "";
  for await (const { value: u } of userIter) {
      if (u.username !== user.username) {
          userListHtml += `
            <div class="flex justify-between items-center border-b border-slate-700 py-2 text-sm">
                <span class="text-slate-300 select-all cursor-pointer" onclick="document.querySelector('input[name=username]').value = '${u.username}'">${u.username}</span>
                <span class="text-green-400">${u.balance.toLocaleString()} Ks</span>
            </div>`;
      }
  }

  return c.html(Layout("Admin", `
    <div class="grid lg:grid-cols-3 gap-8">
      <div class="lg:col-span-1 space-y-6">
        <div class="glass p-6 rounded-xl">
          <h3 class="text-xl font-bold text-white mb-4">💰 User Top Up</h3>
          <form action="/admin/topup" method="POST" class="space-y-3">
            <input name="username" placeholder="Username" required class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white">
            <div class="flex gap-2">
                <input name="amount" type="number" placeholder="Amount" required class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white">
                <button class="bg-blue-600 px-4 rounded text-white font-bold">Add</button>
            </div>
          </form>
        </div>
        <div class="glass p-6 rounded-xl">
             <h3 class="text-lg font-bold text-white mb-2">👥 Registered Users</h3>
             <p class="text-xs text-slate-500 mb-3">Click name to auto-fill</p>
             <div class="max-h-64 overflow-y-auto pr-2">
                ${userListHtml || '<p class="text-slate-500">No other users yet</p>'}
             </div>
        </div>
      </div>

      <div class="lg:col-span-2 space-y-8">
        <div class="glass p-6 rounded-xl">
            <h3 class="text-xl font-bold text-white mb-4">➕ Add Product</h3>
            <form action="/admin/add" method="POST" class="space-y-3">
                <div class="grid grid-cols-2 gap-4">
                    <input name="name" placeholder="Product Name" required class="bg-slate-800 border border-slate-600 rounded p-2 text-white">
                    <input name="price" type="number" placeholder="Price (Ks)" required class="bg-slate-800 border border-slate-600 rounded p-2 text-white">
                </div>
                <input name="desc" placeholder="Description" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white">
                <select name="type" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white">
                    <option value="manual">Manual Stock</option>
                    <option value="api">API Link</option>
                </select>
                <textarea name="data" placeholder="For Manual: Codes (one per line)&#10;For API: URL Link" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white h-20"></textarea>
                <button class="w-full bg-green-600 hover:bg-green-500 text-white font-bold py-2 rounded">Add Product</button>
            </form>
        </div>

        <div class="glass p-6 rounded-xl overflow-x-auto">
          <h3 class="text-xl font-bold text-white mb-4">📦 Inventory</h3>
          <table class="w-full text-left text-slate-300 text-sm">
            <thead class="bg-slate-700 text-white uppercase"><tr><th class="p-3">Name</th><th class="p-3">Price</th><th class="p-3">Stock</th><th class="p-3">Actions</th></tr></thead>
            <tbody>${prodRows}</tbody>
          </table>
        </div>
      </div>
    </div>
  `, user));
});

app.post("/admin/topup", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.isAdmin) return c.redirect("/");
  
  const body = await c.req.parseBody();
  const targetUsername = (body.username as string).trim();
  const amount = Number(body.amount);

  const targetUser = await getUser(targetUsername);
  
  if (!targetUser) {
    return c.html(Layout("Admin Error", `
      <div class="max-w-md mx-auto glass p-8 rounded-xl text-center">
        <h2 class="text-red-400 text-xl font-bold mb-4">User Not Found</h2>
        <p class="text-slate-300">Username "<b>${targetUsername}</b>" does not exist.</p>
        <a href="/admin" class="text-blue-400 mt-4 inline-block">Try Again</a>
      </div>
    `, user));
  }
  
  await kv.set(["users", targetUsername], { ...targetUser, balance: targetUser.balance + amount });
  return c.redirect("/admin");
});

app.post("/admin/add", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.isAdmin) return c.redirect("/");
  const body = await c.req.parseBody();
  
  const p: Product = {
    id: crypto.randomUUID(),
    name: body.name as string,
    description: body.desc as string,
    price: Number(body.price),
    type: body.type as any,
    stock: body.type === 'manual' ? (body.data as string).split("\n").map(s=>s.trim()).filter(Boolean) : [],
    apiUrl: body.type === 'api' ? (body.data as string).trim() : undefined
  };
  await kv.set(["products", p.id], p);
  return c.redirect("/admin");
});

app.post("/admin/delete", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.isAdmin) return c.redirect("/");
  const { id } = await c.req.parseBody();
  await kv.delete(["products", id as string]);
  return c.redirect("/admin");
});

app.get("/admin/edit", async (c) => {
  const user = await getSessionUser(c);
  if (!user?.isAdmin) return c.redirect("/");
  const id = c.req.query("id");
  const p = await getProduct(id!);
  if (!p) return c.redirect("/admin");

  return c.html(Layout("Edit Product", `
    <div class="max-w-lg mx-auto glass p-8 rounded-xl">
      <h2 class="text-2xl font-bold text-white mb-6">Edit Product</h2>
      <form action="/admin/update" method="POST" class="space-y-4">
        <input type="hidden" name="id" value="${p.id}">
        <div>
            <label class="text-slate-400 block mb-1">Name</label>
            <input name="name" value="${p.name}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white">
        </div>
        <div>
            <label class="text-slate-400 block mb-1">Price (Ks)</label>
            <input name="price" type="number" value="${p.price}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white">
        </div>
        <div>
            <label class="text-slate-400 block mb-1">Description</label>
            <input name="desc" value="${p.description}" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white">
        </div>
        <div>
             <label class="text-slate-400 block mb-1">Data</label>
             <textarea name="data" class="w-full bg-slate-800 border border-slate-600 rounded p-2 text-white h-32">${p.type === 'manual' ? p.stock.join("\n") : p.apiUrl}</textarea>
             <small class="text-slate-500">For Manual: One code per line. For API: The URL.</small>
        </div>
        <div class="flex gap-4 pt-4">
            <button class="flex-1 bg-blue-600 hover:bg-blue-500 text-white font-bold py-2 rounded">Update</button>
            <a href="/admin" class="flex-1 bg-slate-700 text-center py-2 rounded text-white">Cancel</a>
        </div>
      </form>
    </div>
  `, user));
});

app.post("/admin/update", async (c) => {
    const user = await getSessionUser(c);
    if (!user?.isAdmin) return c.redirect("/");
    const body = await c.req.parseBody();
    const p = await getProduct(body.id as string);
    if (p) {
        const updated: Product = {
            ...p,
            name: body.name as string,
            price: Number(body.price),
            description: body.desc as string,
            stock: p.type === 'manual' ? (body.data as string).split("\n").map(s=>s.trim()).filter(Boolean) : [],
            apiUrl: p.type === 'api' ? (body.data as string).trim() : undefined
        };
        await kv.set(["products", p.id], updated);
    }
    return c.redirect("/admin");
});

Deno.serve(app.fetch);
