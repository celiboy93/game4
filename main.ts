import { Hono } from "jsr:@hono/hono";
import { getCookie, setCookie, deleteCookie } from "jsr:@hono/hono/cookie";

const app = new Hono();
const kv = await Deno.openKv();

// --- Types ---
interface User {
  username: string;
  password: string; 
  balance: number;
  isAdmin: boolean;
}

interface Product {
  id: string;
  name: string;
  description: string;
  price: number;
  type: "manual" | "api";
  stock?: string[]; 
  apiUrl?: string;  
}

// --- UI Layout (Using Pico.css for pro look) ---
const Layout = (title: string, content: string, user?: User) => `
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${title}</title>
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@picocss/pico@1/css/pico.min.css">
  <style>
    nav { margin-bottom: 2rem; border-bottom: 1px solid #333; padding-bottom: 1rem; }
    .shop-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 20px; }
    .card { background: #1e2631; padding: 20px; border-radius: 8px; border: 1px solid #333; }
    .price { font-size: 1.25rem; font-weight: bold; color: #4caf50; }
    .stock-tag { font-size: 0.8rem; background: #333; padding: 2px 8px; border-radius: 4px; }
    .success-box { background: #1b5e20; padding: 20px; border-radius: 8px; color: white; text-align: center; }
    .error-msg { color: #f4511e; font-weight: bold; }
    textarea.code-display { background: #000; color: #0f0; font-family: monospace; }
  </style>
</head>
<body>
  <main class="container">
    <nav>
      <ul>
        <li><strong>🛍️ Digital Store</strong></li>
      </ul>
      <ul>
        ${user 
          ? `<li><a href="/">Shop</a></li>
             ${user.isAdmin ? '<li><a href="/admin">Admin Panel</a></li>' : ''}
             <li>Balance: <mark>${user.balance.toLocaleString()} $</mark></li>
             <li><a href="/logout" role="button" class="outline secondary">Logout</a></li>` 
          : `<li><a href="/login">Login</a></li>
             <li><a href="/register" role="button">Register</a></li>`}
      </ul>
    </nav>
    ${content}
  </main>
</body>
</html>
`;

// --- Middleware: Auth ---
async function getUser(c: any) {
  const sessionUser = getCookie(c, "session_user");
  if (!sessionUser) return null;
  const user = await kv.get<User>(["users", sessionUser]);
  return user.value;
}

// --- Routes ---

// 1. Shop Page
app.get("/", async (c) => {
  const user = await getUser(c);
  if (!user) return c.redirect("/login");

  const productsIter = kv.list<Product>({ prefix: ["products"] });
  let productsHtml = "";
  
  for await (const entry of productsIter) {
    const p = entry.value;
    const isStockAvailable = p.type === 'api' || (p.stock && p.stock.length > 0);
    
    productsHtml += `
      <article class="card">
        <header>
            <strong>${p.name}</strong>
            <br>
            <span class="stock-tag">${p.type === 'api' ? 'Instant Delivery' : `${p.stock?.length} in Stock`}</span>
        </header>
        <p>${p.description}</p>
        <footer>
            <div class="grid">
                <div class="price">$${p.price}</div>
                <form action="/buy" method="POST" style="margin-bottom:0;">
                    <input type="hidden" name="id" value="${p.id}">
                    <button type="submit" ${isStockAvailable ? '' : 'disabled'} class="${isStockAvailable ? '' : 'secondary'}">
                        ${isStockAvailable ? 'Buy Now' : 'Out of Stock'}
                    </button>
                </form>
            </div>
        </footer>
      </article>
    `;
  }

  return c.html(Layout("Shop", `<div class="shop-grid">${productsHtml}</div>`, user));
});

// 2. Authentication
app.get("/login", (c) => c.html(Layout("Login", `
  <article style="max-width: 400px; margin: 0 auto;">
    <h3>Login</h3>
    <form method="POST" action="/login">
      <label>Username <input type="text" name="username" required></label>
      <label>Password <input type="password" name="password" required></label>
      <button type="submit">Login</button>
    </form>
  </article>
`)));

app.post("/login", async (c) => {
  const body = await c.req.parseBody();
  const user = await kv.get<User>(["users", body.username as string]);
  
  if (user.value && user.value.password === body.password) {
    setCookie(c, "session_user", user.value.username);
    return c.redirect("/");
  }
  return c.html(Layout("Login", `<article><p class="error-msg">Invalid Credentials</p><a href="/login">Try Again</a></article>`));
});

app.get("/register", (c) => c.html(Layout("Register", `
  <article style="max-width: 400px; margin: 0 auto;">
    <h3>Register</h3>
    <form method="POST" action="/register">
      <label>Username <input type="text" name="username" required></label>
      <label>Password <input type="password" name="password" required></label>
      <button type="submit" class="contrast">Create Account</button>
    </form>
    <small>Note: The first user to register becomes the Admin.</small>
  </article>
`)));

app.post("/register", async (c) => {
  const body = await c.req.parseBody();
  const username = body.username as string;
  
  const existing = await kv.get(["users", username]);
  if (existing.value) return c.html(Layout("Register", `<article><p class="error-msg">Username already taken</p><a href="/register">Back</a></article>`));

  // Check if first user
  const list = kv.list({ prefix: ["users"] }, { limit: 1 });
  const isFirst = (await list.next()).done;

  const newUser: User = {
    username,
    password: body.password as string,
    balance: 0,
    isAdmin: isFirst
  };

  await kv.set(["users", username], newUser);
  setCookie(c, "session_user", username);
  return c.redirect("/");
});

app.get("/logout", (c) => {
  deleteCookie(c, "session_user");
  return c.redirect("/login");
});

// 3. Purchase Transaction
app.post("/buy", async (c) => {
  const user = await getUser(c);
  if (!user) return c.redirect("/login");

  const body = await c.req.parseBody();
  const productId = body.id as string;
  const productRes = await kv.get<Product>(["products", productId]);
  const product = productRes.value;

  if (!product) return c.html(Layout("Error", "<article>Product not found <a href='/'>Back</a></article>", user));
  if (user.balance < product.price) return c.html(Layout("Error", "<article><p class='error-msg'>Insufficient Balance. Please contact Admin.</p><a href='/'>Back</a></article>", user));

  let deliveredData = "";

  // Transaction Logic
  if (product.type === "manual") {
    if (!product.stock || product.stock.length === 0) return c.html(Layout("Error", "<article>Out of Stock</article>", user));
    deliveredData = product.stock[0];
    
    const newStock = product.stock.slice(1);
    const newBalance = user.balance - product.price;
    
    const res = await kv.atomic()
      .check(productRes)
      .check(await kv.get(["users", user.username]))
      .set(["products", productId], { ...product, stock: newStock })
      .set(["users", user.username], { ...user, balance: newBalance })
      .commit();

    if (!res.ok) return c.html(Layout("Error", "<article>Transaction Failed (Concurrency Error). Try Again.</article>", user));
  } 
  else if (product.type === "api" && product.apiUrl) {
    try {
        const apiRes = await fetch(product.apiUrl);
        if(!apiRes.ok) throw new Error("API Error");
        const text = await apiRes.text(); 
        deliveredData = text;

        const newBalance = user.balance - product.price;
        const res = await kv.atomic()
            .check(await kv.get(["users", user.username]))
            .set(["users", user.username], { ...user, balance: newBalance })
            .commit();
        if (!res.ok) return c.html(Layout("Error", "<article>Transaction Failed</article>", user));
    } catch (e) {
        return c.html(Layout("Error", "<article>Service Temporarily Unavailable (API Error)</article>", user));
    }
  }

  return c.html(Layout("Success", `
    <div class="success-box">
        <h2>Purchase Successful!</h2>
        <p>Here is your item:</p>
        <textarea class="code-display" rows="4" readonly>${deliveredData}</textarea>
        <br><br>
        <a href="/" role="button" class="outline">Back to Shop</a>
    </div>
  `, { ...user, balance: user.balance - product.price }));
});

// 4. Admin Panel
app.get("/admin", async (c) => {
    const user = await getUser(c);
    if (!user || !user.isAdmin) return c.redirect("/");

    const productsIter = kv.list<Product>({ prefix: ["products"] });
    let productList = "";
    for await (const entry of productsIter) {
        productList += `
        <tr>
            <td>${entry.value.name}</td>
            <td>${entry.value.type}</td>
            <td>${entry.value.price}</td>
            <td>${entry.value.type === 'manual' ? entry.value.stock?.length : 'Unlimited'}</td>
            <td>
                <form action="/admin/delete-product" method="POST" style="margin:0">
                    <input type="hidden" name="id" value="${entry.value.id}">
                    <button class="outline contrast" style="padding:5px 10px; font-size:0.8rem">Delete</button>
                </form>
            </td>
        </tr>`;
    }

    return c.html(Layout("Admin Panel", `
      <h1>Admin Dashboard</h1>
      
      <div class="grid">
        <article>
            <header><strong>Top Up Balance</strong></header>
            <form action="/admin/topup" method="POST">
                <input type="text" name="username" placeholder="Username" required>
                <input type="number" name="amount" placeholder="Amount" required>
                <button type="submit">Add Funds</button>
            </form>
        </article>

        <article>
            <header><strong>Add New Product</strong></header>
            <form action="/admin/add-product" method="POST">
                <input type="text" name="name" placeholder="Product Name" required>
                <input type="text" name="description" placeholder="Short Description">
                <div class="grid">
                    <input type="number" name="price" placeholder="Price" required>
                    <select name="type">
                        <option value="manual">Manual Stock</option>
                        <option value="api">API Integration</option>
                    </select>
                </div>
                <textarea name="data" placeholder="For Manual: Paste codes (one per line).&#10;For API: Paste the API URL." rows="4"></textarea>
                <button type="submit" class="contrast">Create Product</button>
            </form>
        </article>
      </div>

      <article>
        <header><strong>Product Inventory</strong></header>
        <table role="grid">
            <thead>
                <tr>
                    <th>Name</th>
                    <th>Type</th>
                    <th>Price</th>
                    <th>Stock</th>
                    <th>Action</th>
                </tr>
            </thead>
            <tbody>${productList}</tbody>
        </table>
      </article>
    `, user));
});

app.post("/admin/topup", async (c) => {
    const user = await getUser(c);
    if (!user || !user.isAdmin) return c.redirect("/");
    const body = await c.req.parseBody();
    
    const targetUserRes = await kv.get<User>(["users", body.username as string]);
    if (!targetUserRes.value) return c.html(Layout("Admin", "<article>User not found <a href='/admin'>Back</a></article>", user));
    
    const newBalance = targetUserRes.value.balance + Number(body.amount);
    await kv.set(["users", body.username as string], { ...targetUserRes.value, balance: newBalance });
    return c.redirect("/admin");
});

app.post("/admin/add-product", async (c) => {
    const user = await getUser(c);
    if (!user || !user.isAdmin) return c.redirect("/");

    const body = await c.req.parseBody();
    const id = crypto.randomUUID();
    const type = body.type as "manual" | "api";
    
    const newProduct: Product = {
        id,
        name: body.name as string,
        description: body.description as string || "",
        price: Number(body.price),
        type,
    };

    if (type === "manual") {
        newProduct.stock = (body.data as string).split("\n").map(s => s.trim()).filter(s => s.length > 0);
    } else {
        newProduct.apiUrl = (body.data as string).trim();
    }

    await kv.set(["products", id], newProduct);
    return c.redirect("/admin");
});

app.post("/admin/delete-product", async (c) => {
    const user = await getUser(c);
    if (!user || !user.isAdmin) return c.redirect("/");
    const body = await c.req.parseBody();
    await kv.delete(["products", body.id as string]);
    return c.redirect("/admin");
});

Deno.serve(app.fetch);
