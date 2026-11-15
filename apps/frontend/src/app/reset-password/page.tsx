import { RecoveryForm } from '@/components/auth/recovery-form';
import type { Metadata } from 'next';

export const metadata: Metadata = { referrer: 'no-referrer' };

export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <RecoveryForm initialToken={typeof token === 'string' ? token : undefined} resetOnly />;
}
