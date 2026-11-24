import { redirect } from 'next/navigation';

export default function WorkTimerRedirect() {
  redirect('/dashboard/my-attendance');
}
