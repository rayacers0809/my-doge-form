// 루트로 접속하면 정적 폼으로 리다이렉트
import { redirect } from 'next/navigation';
export default function Page() {
  redirect('/index.html');
}
