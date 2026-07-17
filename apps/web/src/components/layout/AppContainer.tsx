import type { ReactNode } from "react";

type AppContainerProps = {
  children: ReactNode;
  className?: string;
  as?: "div" | "section" | "main";
};

export function AppContainer({
  children,
  className = "",
  as: Tag = "div",
}: AppContainerProps) {
  return (
    <Tag className={`app-container${className ? ` ${className}` : ""}`}>
      {children}
    </Tag>
  );
}
