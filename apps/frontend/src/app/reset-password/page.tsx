import { RecoveryForm } from '@/components/auth/recovery-form';

export default async function ResetPasswordPage({ searchParams }: {
  searchParams: Promise<{ token?: string | string[] }>;
}) {
  const { token } = await searchParams;
  return <RecoveryForm initialToken={typeof token === 'string' ? token : undefined} resetOnly />;
}
