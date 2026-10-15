import './globals.css';

export const metadata = {
  title: 'Надины 40 — викторина',
  description: 'Праздничная викторина для Надиного дня рождения',
};

export default function RootLayout({ children }) {
  return <html lang="ru"><body>{children}</body></html>;
}
