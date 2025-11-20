import { User, Product } from "./db.ts";

export const Layout = (title: string, content: string, user?: User) => `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <style>
    body { font-family: sans-serif; background-color: #0f172a; color: #e2e8f0; }
    .glass { background: rgba(30, 41, 59, 0.7); backdrop-filter: blur(10px); border: 1px solid rgba(255, 255, 255, 0.1); }
  </style>
</head>
<body class="min-h-screen flex flex-col">
  <nav class="glass sticky top-0 z-50 border-b border-slate-700">
    <div class="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
      <a href="/" class="text-2xl font-bold text-blue-500 hover:text-blue-400 transition">🎮 GameStore</a>
      <div class="flex gap-4 items-center">
        ${user ? `
          <div class="hidden md:block text-sm text-slate-400">Balance: <span class="text-green-400 font-bold text-lg">${user.balance.toLocaleString()} Ks</span></div>
          ${user.isAdmin ? '<a href="/admin" class="text-yellow-400 hover:text-yellow-300 font-semibold">Admin Panel</a>' : ''}
          <a href="/logout" class="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded-lg text-sm transition">Logout</a>
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
    <div>
      <label class="block text-sm font-medium text-slate-400 mb-1">Username</label>
      <input type="text" name="username" required class="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none text-white">
    </div>
    <div>
      <label class="block text-sm font-medium text-slate-400 mb-1">Password</label>
      <input type="password" name="password" required class="w-full bg-slate-800 border border-slate-600 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 outline-none text-white">
    </div>
    <button class="w-full bg-blue-600 hover:bg-blue-500 text-white font-bold py-3 rounded-lg transition shadow-lg shadow-blue-500/30">${type}</button>
  </form>
  <p class="mt-4 text-center text-slate-400 text-sm">
    ${type === 'Login' ? 'Don\'t have an account? <a href="/register" class="text-blue-400">Register</a>' : 'Already have an account? <a href="/login" class="text-blue-400">Login</a>'}
  </p>
</div>
`;

export const ProductCard = (p: Product) => {
  const hasStock = p.type === 'api' || (p.stock && p.stock.length > 0);
  return `
  <div class="glass rounded-xl overflow-hidden hover:shadow-2xl hover:shadow-blue-500/10 transition transform hover:-translate-y-1 duration-300 flex flex-col h-full">
    <div class="p-5 flex-grow">
      <div class="flex justify-between items-start mb-2">
        <h3 class="text-xl font-bold text-white truncate">${p.name}</h3>
        <span class="text-xs px-2 py-1 rounded ${hasStock ? 'bg-green-500/20 text-green-400' : 'bg-red-500/20 text-red-400'}">
          ${p.type === 'api' ? 'Instant' : `Stock: ${p.stock.length}`}
        </span>
      </div>
      <p class="text-slate-400 text-sm mb-4 line-clamp-2">${p.description}</p>
      <div class="text-2xl font-bold text-blue-400">${p.price.toLocaleString()} Ks</div>
    </div>
    <div class="p-5 pt-0 mt-auto">
      <form action="/buy" method="POST">
        <input type="hidden" name="id" value="${p.id}">
        <button ${!hasStock ? 'disabled' : ''} class="w-full ${hasStock ? 'bg-blue-600 hover:bg-blue-500' : 'bg-slate-700 cursor-not-allowed'} text-white font-bold py-2 rounded-lg transition flex justify-center items-center gap-2">
          ${hasStock ? '⚡ Buy Now' : '🚫 Out of Stock'}
        </button>
      </form>
    </div>
  </div>
  `;
};
