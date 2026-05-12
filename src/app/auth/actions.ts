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
  email: z.string().email('Invalid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  confirmPassword: z.string(),
  fullName: z.string().min(1, 'Full name is required'),
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
  if (error) {
    if (error.message === 'Email not confirmed') {
      return { error: 'Please confirm your email before logging in.', code: 'email_not_confirmed', email: parsed.data.email };
    }
    return { error: 'Invalid email or password' };
  }

  revalidatePath('/', 'layout');
  redirect('/dashboard');
}

export async function resendConfirmationEmail(_prev: unknown, formData: FormData) {
  const email = formData.get('email') as string;
  if (!email) return { error: 'Email is required' };

  const supabase = await createClient();
  const { error } = await supabase.auth.resend({ type: 'signup', email });
  if (error) return { error: 'Could not resend email. Please try again.' };
  return { success: true };
}

export async function register(_prev: unknown, formData: FormData) {
  const parsed = registerSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    confirmPassword: formData.get('confirmPassword'),
    fullName: formData.get('fullName'),
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Validation error' };
  }

  const supabase = await createClient();
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
    },
  });

  if (authError) {
    console.error('[register] signUp error:', JSON.stringify(authError, null, 2));
    if (authError.message.toLowerCase().includes('already registered')) {
      return { error: 'Email already registered' };
    }
    return { error: authError.message };
  }

  console.log('[register] signUp success, user:', authData.user?.id, 'session:', !!authData.session);

  revalidatePath('/', 'layout');

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
  if (error) return { error: 'Could not update password. Your reset link may have expired.' };

  return { success: true };
}
