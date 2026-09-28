import { notFound } from 'next/navigation';
export const metadata = {
  title: '账号登录｜摄影作品集平台',
  description: '登录受邀账号，进入自己的摄影作品集工作台。',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default async function LoginPage() {
  if (process.env.FRAME_ZERO_ACCOUNT_NODE_RUNTIME !== '1' || process.env.FRAME_ZERO_LOCAL_ACCOUNTS !== '1') notFound();
  const { default: Login } = await import('./login');
  return <Login />;
}
