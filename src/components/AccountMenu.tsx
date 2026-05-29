"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type AccountMenuProps = {
  name?: string | null;
  email: string;
  image?: string | null;
  signOutAction: () => Promise<void>;
};

function getInitials(name?: string | null, email?: string): string {
  const source = (name && name.trim()) || email || "U";
  const parts = source
    .replace(/@.*/, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length >= 2) {
    return `${parts[0][0] ?? ""}${parts[1][0] ?? ""}`.toUpperCase();
  }
  return (parts[0]?.slice(0, 2) ?? "U").toUpperCase();
}

export default function AccountMenu({ name, email, image, signOutAction }: AccountMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const initials = useMemo(() => getInitials(name, email), [name, email]);

  useEffect(() => {
    if (!isOpen) return;

    function onPointerDown(event: MouseEvent) {
      if (!wrapperRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="account-menu" ref={wrapperRef}>
      <button
        type="button"
        className="avatar-trigger"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        aria-haspopup="menu"
        aria-label="Open account menu"
      >
        {image ? (
          <img
            className="avatar-image"
            src={image}
            alt={email ? `${email} profile` : "Profile"}
            width={36}
            height={36}
          />
        ) : (
          <span className="avatar-fallback" aria-hidden="true">{initials}</span>
        )}
      </button>

      {isOpen ? (
        <div className="account-dropdown" role="menu" aria-label="Account menu">
          <div className="account-identity">
            <strong>{name?.trim() || email}</strong>
            <small>{email}</small>
          </div>
          <form action={signOutAction}>
            <button type="submit" className="menu-action">Sign out</button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
