// Usa o mesmo cliente com cookies para manter sessão alinhada com o middleware
import { supabaseBrowser } from "@/lib/supabaseBrowser";

export const supabase = supabaseBrowser;