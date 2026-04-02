import { createClient } from "@supabase/supabase-js";

const uid = process.argv[2];
const newPassword = process.argv[3];

if (!uid || !newPassword) {
  console.log("Uso: node scripts/reset-password.mjs <UID> <NOVA_SENHA>");
  process.exit(1);
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  console.log("Faltou NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local");
  process.exit(1);
}

const supabaseAdmin = createClient(url, serviceKey);

const { error } = await supabaseAdmin.auth.admin.updateUserById(uid, {
  password: newPassword,
});

if (error) {
  console.error("Erro:", error.message);
  process.exit(1);
}

console.log("Senha atualizada com sucesso ✅");
