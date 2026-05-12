'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient, createAdminClient } from '@/lib/supabase/server';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  fullName: z.string().min(1),
  companyName: z.string().min(1),
}).refine(d => d.password === d.confirmPassword, {
  message: 'Passwords do not match',
  path: ['confirmPassword'],
});

export async function login(_prev: unknown, formData: FormData) {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
  });
  if (!parsed.success) return { error: 'Invalid email or password' };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { error: 'Invalid email or password' };

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function register(_prev: unknown, formData: FormData) {
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    fullName: formData.get('fullName'),
    companyName: formData.get('companyName'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation error' };
  }

  const adminClient = createAdminClient();

  // Create company via admin client (user has no session yet — bypasses RLS)
  const { data: company, error: companyError } = await adminClient
    .from('companies')
    .insert({ company_name: parsed.data.companyName })
    .select()
    .single();

  if (companyError) return { error: 'Could not create company' };

  // Sign up user
  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (authError) {
    // Roll back company creation
    await adminClient.from('companies').delete().eq('id', company.id);
    if (authError.message.toLowerCase().includes('already registered')) {
      return { error: 'Email already registered' };
    }
    return { error: 'Could not create account' };
  }

  // Upsert profile via admin client (auth trigger may have already created a bare row)
  if (authData.user) {
    await adminClient.from('profiles').upsert({
      id: authData.user.id,
      email: parsed.data.email,
      full_name: parsed.data.fullName,
      company_id: company.id,
      is_admin: false,
    });
  }

  revalidatePath('/', 'layout');

  // If email confirmation is disabled, session exists immediately → go to onboarding
  // If email confirmation is enabled, session is null → tell user to check email
  if (authData.session) {
    redirect('/onboarding');
  } else {
    redirect('/auth/verify-email');
  }
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function resetPassword(_prev: unknown, formData: FormData) {
  const email = formData.get('email') as string;
  if (!email) return { error: 'Email is required' };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/callback?next=/auth/reset-password`,
  });

  if (error) return { error: 'Could not send reset email' };
  return { success: true };
}

export async function updatePassword(_prev: unknown, formData: FormData) {
  const password = formData.get('password') as string;
  const confirm = formData.get('confirmPassword') as string;

  if (!password || password.length < 8) return { error: 'Password must be at least 8 characters' };
  if (password !== confirm) return { error: 'Passwords do not match' };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) return { error: 'Could not update password' };

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}
