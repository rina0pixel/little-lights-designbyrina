import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {title:"Little Lights · A Thadingyut Night",description:"Make a wish, share a little sweetness, and celebrate Myanmar’s festival of lights."};
export default function RootLayout({children}:{children:React.ReactNode}) {return <html lang="en"><body>{children}</body></html>}
