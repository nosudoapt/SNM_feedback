import "./globals.css";

export const metadata = {
  title: "Pracharak Mahatma Feedback",
  description: "Feedback capture and admin dashboard",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        {children}
      </body>
    </html>
  );
}
