import { notFound } from 'next/navigation';
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (process.env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME !== '1' || process.env.FRAME_ZERO_LOCAL_ACCOUNTS !== '1') notFound();
  const { default: Login } = await import('./login');
  return <Login />;
}
