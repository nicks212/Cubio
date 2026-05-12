'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
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

  const supabase = await createClient();

  // Create company first
  const { data: company, error: companyError } = await supabase
    .from('companies')
    .insert({ company_name: parsed.data.companyName })
    .select()
    .single();

  if (companyError) return { error: 'Could not create company' };

  // Sign up user
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: {
        full_name: parsed.data.fullName,
        company_id: company.id,
      },
    },
  });

  if (authError) {
    if (authError.message.includes('already registered')) return { error: 'Email already registered' };
    return { error: 'Could not create account' };
  }

  // Create profile record
  if (authData.user) {
    await supabase.from('profiles').upsert({
      id: authData.user.id,
      email: parsed.data.email,
      full_name: parsed.data.fullName,
      company_id: company.id,
      is_admin: false,
    });
  }

  revalidatePath('/', 'layout');
  redirect('/onboarding');
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
    redirectTo: `${process.env.NEXT_PUBLIC_SITE_URL}/auth/reset-password`,
  });

  if (error) return { error: 'Could not send reset email' };
  return { success: true };
}
