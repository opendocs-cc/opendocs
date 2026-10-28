"use client";

import type { ReactNode } from "react";
import { X } from "lucide-react";

type ModalOverlayProps = {
  children: ReactNode;
  onClose: () => void;
  maxWidth?: string;
};

export function ModalOverlay({ children, onClose, maxWidth = "400px" }: ModalOverlayProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className="relative bg-white rounded-xl shadow-xl p-6 w-full max-h-[calc(100vh-32px)] overflow-y-auto"
        style={{ maxWidth }}
      >
        <button
          onClick={onClose}
          className="absolute right-4 top-4 text-[#A3A3A3] hover:text-[#525252] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        {children}
      </div>
    </div>
  );
}
