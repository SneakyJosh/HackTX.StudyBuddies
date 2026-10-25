export function BrandMark({ size = 88, label = "StudySync" }: { size?: number; label?: string }) {
  return (
    <div
      className="brand-orb grid shrink-0 place-items-center rounded-full"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 64 64" width="62%" height="62%" aria-hidden="true">
        <ellipse cx="32" cy="36" rx="20" ry="17" fill="#3D2A1A" />
        <path d="M16 22c2 8 6 10 8 6" fill="none" stroke="#3D2A1A" strokeWidth="3" strokeLinecap="round" />
        <path d="M48 22c-2 8-6 10-8 6" fill="none" stroke="#3D2A1A" strokeWidth="3" strokeLinecap="round" />
        <ellipse cx="23" cy="33" rx="8" ry="7.5" fill="#F6F1E8" />
        <ellipse cx="41" cy="33" rx="8" ry="7.5" fill="#F6F1E8" />
        <circle cx="23" cy="33" r="3.1" fill="#1A120C" />
        <circle cx="41" cy="33" r="3.1" fill="#1A120C" />
        <path d="M29.2 39.5 32 43.2 34.8 39.5" fill="#E7A07A" />
      </svg>
    </div>
  );
}
