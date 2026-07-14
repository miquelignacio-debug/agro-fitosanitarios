import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";

// Server-side only — usa la service role key para gestionar auth users
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

async function requireAdmin(req: NextRequest): Promise<NextResponse | null> {
  const token = req.headers.get("authorization")?.replace("Bearer ", "");
  if (!token) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data: { user } } = await supabaseAdmin.auth.getUser(token);
  if (!user) return NextResponse.json({ error: "No autenticado." }, { status: 401 });
  const { data } = await supabaseAdmin.from("usuarios").select("rol").eq("id", user.id).single();
  if (data?.rol !== "admin") return NextResponse.json({ error: "Sin permisos de administrador." }, { status: 403 });
  return null;
}

export async function POST(req: NextRequest) {
  const authError = await requireAdmin(req);
  if (authError) return authError;
  const { email, password, nombre, rut, rol } = await req.json();

  if (!email || !password || !nombre) {
    return NextResponse.json({ error: "Email, contraseña y nombre son obligatorios." }, { status: 400 });
  }

  // Crear usuario en Supabase Auth
  const { data, error } = await supabaseAdmin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre, rol: rol || "admin" },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  // Upsert en tabla usuarios (el trigger también lo hace, pero por si acaso)
  await supabaseAdmin.from("usuarios").upsert({
    id: data.user.id,
    nombre,
    rut: rut || null,
    rol: rol || "admin",
  });

  return NextResponse.json({ ok: true, id: data.user.id });
}

export async function PATCH(req: NextRequest) {
  const authError = await requireAdmin(req);
  if (authError) return authError;
  const { id, nombre, rut, rol, password } = await req.json();

  if (!id) return NextResponse.json({ error: "ID requerido." }, { status: 400 });

  // Actualizar tabla usuarios
  await supabaseAdmin.from("usuarios").update({ nombre, rut: rut || null, rol }).eq("id", id);

  // Cambiar contraseña si se proporcionó
  if (password) {
    await supabaseAdmin.auth.admin.updateUserById(id, { password });
  }

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const authError = await requireAdmin(req);
  if (authError) return authError;
  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "ID requerido." }, { status: 400 });

  await supabaseAdmin.auth.admin.deleteUser(id);
  await supabaseAdmin.from("usuarios").delete().eq("id", id);

  return NextResponse.json({ ok: true });
}
