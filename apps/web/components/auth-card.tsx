import type { ReactNode } from "react";

type AuthCardProps = {
  title: string;
  description: string;
  children: ReactNode;
  footer?: ReactNode;
  eyebrow?: string;
};

export function AuthCard({
  title,
  description,
  children,
  footer,
}: AuthCardProps) {
  return (
    <div className="flex flex-col items-start max-w-[360px] w-full">
      <div className="flex flex-col gap-[32px] items-start w-full">
        {/* Header */}
        <div className="flex flex-col items-center w-full">
          <div className="flex flex-col gap-[12px] items-start w-full">
            <h1 className="font-semibold leading-[32px] text-[#171717] text-[24px] w-full">
              {title}
            </h1>
            <p className="font-normal leading-[24px] text-[#525252] text-[16px] w-full">
              {description}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="flex flex-col gap-[24px] items-center rounded-[12px] w-full">
          {children}
        </div>

        {/* Footer */}
        {footer ? (
          <div className="flex gap-[4px] items-baseline justify-center w-full">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
