import { User, Product, Transaction } from "./db.ts";

export const Layout = (title: string, content: string, user?: User) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    function copyToClipboard(text) {
        navigator.clipboard.writeText(text).then(() => {
            const btn = document.getElementById('copyBtn');
            if(btn) {
                const originalText = btn.innerHTML;
                btn.innerHTML = '✅ Copied!';
                btn.classList.remove('bg-blue-600');
                btn.classList.add('bg-green-600');
                setTimeout(() => {
                    btn.innerHTML = originalText;
                    btn.classList.remove('bg-green-600');
                    btn.classList.add('bg-blue-600');
                }, 2000);
            }
        });
    }

    // New: Lazy Load Stock
    document.addEventListener("DOMContentLoaded", () => {
        const apiProducts = document.querySelectorAll(".api-stock-loader");
        apiProducts.forEach(async (el) => {
            const id = el.dataset.id;
            try {
                const res = await fetch("/check-stock?id=" + id);
                const text = await res.text();
                el.innerText = text;
                // If stock is 0, disable button
                if(text.includes("0") || text === "?") {
                   const btn = document.getElementById("btn-" + id);
                   if(btn) {
                       btn.disabled = true;
                       btn.classList.remove("bg-blue-600", "hover:bg-blue-500");
                       btn.classList.add("bg-slate-700", "cursor-not-allowed");
                       btn.innerText = "🚫 Out of Stock";
                   }
                }
            } catch {
                el.innerText = "Err";
            }
        });
    });
  </script>
  <style>
    body { font-family: sans-serif; background-color: #0f172a; color: #e2e8f0; }
    .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
    .code-box { background-image: radial-gradient(#334155 1px, transparent 1px); background-size: 10px 10px; }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <nav class="glass sticky top-0 z-50 border-b border-slate-700">
    <div class="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
      <a href="/" class="text-2xl font-bold text-blue-500 hover:text-blue-400 transition">🎮 GameStore</a>
      <div class="flex gap-4 items-center">
        ${user ? `
          <div class="hidden md:block text-sm text-slate-400">Balance: <span class="text-green-400 font-bold text-lg">${user.balance.toLocaleString()} Ks</span></div>
          <a href="/history" class="text-slate-300 hover:text-white font-medium">History</a>
          ${user.isAdmin ? '<a href="/admin" class="text-yellow-400 hover:text-yellow-300 font-semibold">Admin Panel</a>' : ''}
          <a href="/logout" class="bg-red-600 hover:bg-red-700 text-white px-3 py-1 rounded text-sm transition">Logout</a>
        ` : `
          <a href="/login" class="text-slate-300 hover:text-white">Login</a>
          <a href="/register" class="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition">Register</a>
        `}
      </div>
    </div>
    ${user ? `<div class="md:hidden px-4 pb-2 text-center border-t border-slate-700 pt-2 text-slate-400">Balance: <span class="text-green-400 font-bold">${user.balance.toLocaleString()} Ks</span></div>` : ''}
  </nav>
  <main class="flex-grow container mx-auto px-4 py-8">
    ${content}
  </main>
  <footer class="text-center text-slate-600 py-6 text-sm">
    &copy; 2025 Digital Shop System
  </footer>
</body>
</html>
`;

export const AuthForm = (type: "Login" | "Register", error?: string) => `
<div class="max-w-md mx-auto glass p-8 rounded-2xl shadow-2xl">
  <h2 class="text-3xl font-bold text-center mb-6 text-white">${type}</h2>
  ${error ? `<div class="bg-red-500/20 border border-red-500 text-red-200 p-3 rounded mb-4 text-center">${error}</div>` : ''}
  <form method="POST" class="space-y-4">
    <div><label class="block text-sm font-medium text-slate-400 mb-1">Username</label><input type="text" name="username" required class="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none text-white"></div>
    <div><label class="block text-sm font-medium text-slate-400 mb-1">Password</label><input type="password" name="password" required class="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none text-white"></div>
    <button class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-blue-500/30">${type}</button>
  </form>
  <p class="mt-4 text-center text-slate-400 text-sm">
    ${type === 'Login' ? 'Don\'t have an account? <a href="/register" class="text-blue-400">Register</a>' : 'Already have an account? <a href="/login" class="text-blue-400">Login</a>'}
  </p>
</div>
`;

export const ProductCard = (p: Product) => {
  // For manual, we know stock immediately. For API, we load lazily.
  const isManual = p.type === 'manual';
  const manualStock = p.stock ? p.stock.length : 0;
  
  const stockDisplay = isManual 
      ? `Stock: ${manualStock}` 
      : `API Stock: <span class="api-stock-loader animate-pulse" data-id="${p.id}">...</span>`;
  
  // Initially disable only if manual stock is 0. API button will be disabled by JS later if 0.
  const isDisabled = isManual && manualStock === 0;

  return `
  <div class="glass rounded-xl overflow-hidden hover:shadow-2xl hover:shadow-blue-500/10 transition transform hover:-translate-y-1 duration-300 flex flex-col h-full">
    <div class="p-5 flex-grow">
      <div class="flex justify-between items-start mb-2">
        <h3 class="text-xl font-bold text-white truncate">${p.name}</h3>
        <span class="text-xs px-2 py-1 rounded ${!isDisabled ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
          ${stockDisplay}
        </span>
      </div>
      <p class="text-slate-400 text-sm mb-4 line-clamp-2">${p.description}</p>
      <div class="text-2xl font-bold text-blue-400">${p.price.toLocaleString()} Ks</div>
    </div>
    <div class="p-5 pt-0 mt-auto">
      <form action="/buy" method="POST">
        <input type="hidden" name="id" value="${p.id}">
        <button id="btn-${p.id}" ${isDisabled ? 'disabled' : ''} class="w-full ${!isDisabled ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-700 cursor-not-allowed'} text-white font-bold py-2 rounded-lg transition flex justify-center items-center gap-2">
          ${isDisabled ? '🚫 Out of Stock' : '⚡ Buy Now'}
        </button>
      </form>
    </div>
  </div>
  `;
};

export const HistoryTable = (transactions: Transaction[], nextCursor: string | null) => {
    let rows = "";
    if (transactions.length === 0) {
        rows = `<tr><td colspan="4" class="p-4 text-center text-slate-500">No transaction history found.</td></tr>`;
    } else {
        rows = transactions.map(t => `
            <tr class="border-b border-slate-700 hover:bg-slate-800/50 transition">
                <td class="p-4 text-sm text-slate-400">${new Date(t.date).toLocaleString()}</td>
                <td class="p-4"><span class="px-2 py-1 rounded text-xs font-bold ${t.type === 'purchase' ? 'bg-blue-500/20 text-blue-400' : 'bg-green-500/20 text-green-400'}">${t.type.toUpperCase()}</span></td>
                <td class="p-4 font-medium text-white">${t.itemName} ${t.type === 'purchase' ? `<div class="text-xs text-slate-500 mt-1 font-mono truncate w-32 md:w-64">${t.detail.substring(0, 30)}...</div>` : ''}</td>
                <td class="p-4 text-right ${t.type === 'purchase' ? 'text-red-400' : 'text-green-400'} font-bold">${t.type === 'purchase' ? '-' : '+'}${t.amount.toLocaleString()} Ks</td>
            </tr>
        `).join("");
    }
    return `<div class="glass rounded-xl overflow-hidden"><div class="overflow-x-auto"><table class="w-full text-left"><thead class="bg-slate-800 text-slate-300 uppercase text-xs"><tr><th class="p-4">Date</th><th class="p-4">Type</th><th class="p-4">Description</th><th class="p-4 text-right">Amount</th></tr></thead><tbody class="divide-y divide-slate-700">${rows}</tbody></table></div>${nextCursor ? `<div class="p-4 text-center border-t border-slate-700"><a href="/history?cursor=${nextCursor}" class="inline-block bg-slate-700 hover:bg-slate-600 text-white px-6 py-2 rounded transition">Load Next 10 Entries</a></div>` : ''}</div>`;
};
