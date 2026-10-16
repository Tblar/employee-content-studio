import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'Content Studio',
  description: 'Employee website content and approval dashboard',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
