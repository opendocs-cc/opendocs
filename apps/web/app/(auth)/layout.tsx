import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

import { AuthTerminal } from "./components/auth-terminal";
import "./auth.css";

type AuthLayoutProps = {
  children: ReactNode;
};

export default function AuthLayout({ children }: AuthLayoutProps) {
  return (
    <div className="bg-white flex items-center relative w-full min-h-screen">
      {/* Left Column - Form */}
      <div className="flex flex-1 flex-row items-center justify-center self-stretch relative p-8">
        <div className="absolute left-8 top-8">
          <Link href="/">
            <Image src="/opendocs-logo.svg" alt="OpenDocs" width={138} height={26} priority />
          </Link>
        </div>
        <div className="w-full flex items-center justify-center mt-12">
          {children}
        </div>
      </div>

      {/* Right Column - Animated Terminal */}
      <div className="hidden lg:flex flex-1 flex-row items-center self-stretch">
        <div className="bg-[#f5f5f5] flex-1 h-full min-h-px min-w-px overflow-hidden relative">
          <div className="auth-visual">
            <AuthTerminal />
            <p className="auth-visual__tagline">
              Publish docs. Export PDFs. Ship fast. <span>Impress everyone.</span>
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
