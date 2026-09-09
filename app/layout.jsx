import "./globals.css";

export const metadata = {
  title: "BMS Admin",
  description: "Bid Management System admin dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
