import type { SVGProps } from 'react';

type P = SVGProps<SVGSVGElement>;

function Icon({ children, ...p }: P) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={20}
      height={20}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...p}
    >
      {children}
    </svg>
  );
}

export const ShieldIcon = (p: P) => (
  <Icon {...p}>
    <path d="M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z" />
    <path d="M8.5 12l2.5 2.5 4.5-5" />
  </Icon>
);

export const ClockIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Icon>
);

export const SoundIcon = ({ muted, ...p }: P & { muted?: boolean }) => (
  <Icon {...p}>
    <path d="M4 9v6h4l5 4V5L8 9H4z" />
    {muted ? <path d="M17 9l4 6M21 9l-4 6" /> : <path d="M16.5 8.5a5 5 0 010 7M19 6a8.5 8.5 0 010 12" />}
  </Icon>
);

export const HelpIcon = (p: P) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9.5a2.5 2.5 0 015 .5c0 1.7-2.5 2-2.5 3.5" />
    <circle cx="12" cy="17" r=".6" fill="currentColor" />
  </Icon>
);

export const CloseIcon = (p: P) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const CheckIcon = (p: P) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

/** A bee facing right, for the UI (the canvas draws its own). */
export const BeeIcon = (p: P) => (
  <svg viewBox="0 0 32 24" width={26} height={20} aria-hidden {...p}>
    <ellipse cx="13" cy="6.5" rx="6.5" ry="3.6" transform="rotate(-28 13 6.5)" fill="#e6f2ff" opacity="0.85" />
    <ellipse cx="18.5" cy="6" rx="5.6" ry="3.1" transform="rotate(22 18.5 6)" fill="#e6f2ff" opacity="0.75" />
    <clipPath id="bee-body">
      <ellipse cx="15" cy="14" rx="9.5" ry="6.6" />
    </clipPath>
    <ellipse cx="15" cy="14" rx="9.5" ry="6.6" fill="#ffc61a" />
    <g clipPath="url(#bee-body)" fill="#2b1a07">
      <rect x="10" y="6" width="2.8" height="16" />
      <rect x="15.4" y="6" width="2.8" height="16" />
    </g>
    <circle cx="24.4" cy="14" r="4" fill="#2b1a07" />
    <circle cx="25.6" cy="12.7" r="1.1" fill="#fff" />
    <path d="M5.8 12.6L1.5 14l4.3 1.4z" fill="#2b1a07" />
  </svg>
);

export const DropIcon = (p: P) => (
  <svg viewBox="0 0 24 24" width={18} height={18} aria-hidden {...p}>
    <path d="M12 2.5c3.6 5 6.5 8.4 6.5 12a6.5 6.5 0 01-13 0c0-3.6 2.9-7 6.5-12z" fill="#ffb21e" stroke="#ffd25e" strokeWidth="1.2" />
    <ellipse cx="9.6" cy="14.2" rx="1.6" ry="2.4" fill="#fff" opacity="0.5" />
  </svg>
);
