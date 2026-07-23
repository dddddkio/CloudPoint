function IconBase({ children, className = "h-5 w-5", ...props }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {children}
    </svg>
  );
}

export function PointCloudLogo({ className = "h-9 w-9" }) {
  return (
    <svg className={className} viewBox="0 0 36 36" fill="none" aria-label="CloudPoint">
      <rect width="36" height="36" rx="9" fill="#1D4ED8" />
      <path d="M9 24.5 14.5 18 21 21l6-8" stroke="#BFDBFE" strokeWidth="1.4" strokeLinecap="round" />
      <path d="m9 12 5.5 6L21 10l6 3" stroke="#93C5FD" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="9" cy="12" r="2" fill="white" />
      <circle cx="14.5" cy="18" r="2.2" fill="#67E8F9" />
      <circle cx="21" cy="10" r="2" fill="white" />
      <circle cx="27" cy="13" r="1.8" fill="#67E8F9" />
      <circle cx="9" cy="24.5" r="1.8" fill="#67E8F9" />
      <circle cx="21" cy="21" r="2" fill="white" />
      <circle cx="27" cy="26" r="1.5" fill="#BFDBFE" />
    </svg>
  );
}

export function MenuIcon(props) {
  return <IconBase {...props}><path d="M4 7h16M4 12h16M4 17h16" /></IconBase>;
}

export function CollapseIcon({ collapsed, ...props }) {
  return <IconBase {...props}><path d={collapsed ? "m9 6 6 6-6 6" : "m15 6-6 6 6 6"} /><path d={collapsed ? "M4 4v16" : "M20 4v16"} /></IconBase>;
}

export function OverviewIcon(props) {
  return <IconBase {...props}><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></IconBase>;
}

export function UploadIcon(props) {
  return <IconBase {...props}><path d="M12 16V4m0 0L8 8m4-4 4 4M5 15v4h14v-4" /></IconBase>;
}

export function ViewerIcon(props) {
  return <IconBase {...props}><path d="m12 3-8 4.5 8 4.5 8-4.5L12 3Z" /><path d="m4 12 8 4.5 8-4.5M4 16.5 12 21l8-4.5" /></IconBase>;
}

export function DatabaseIcon(props) {
  return <IconBase {...props}><ellipse cx="12" cy="6" rx="8" ry="3" /><path d="M4 6v6c0 1.7 3.6 3 8 3s8-1.3 8-3V6M4 12v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6" /></IconBase>;
}

export function UserIcon(props) {
  return <IconBase {...props}><circle cx="12" cy="8" r="4" /><path d="M5 21a7 7 0 0 1 14 0" /></IconBase>;
}

export function ResetIcon(props) {
  return <IconBase {...props}><path d="M4 7a8 8 0 1 1 0 10M4 3v4h4" /></IconBase>;
}

export function TopViewIcon(props) {
  return <IconBase {...props}><rect x="4" y="4" width="16" height="16" rx="2" /><rect x="8" y="8" width="8" height="8" rx="1" /></IconBase>;
}

export function FullscreenIcon(props) {
  return <IconBase {...props}><path d="M9 4H4v5m11-5h5v5M9 20H4v-5m11 5h5v-5" /></IconBase>;
}

export function CloseIcon(props) {
  return <IconBase {...props}><path d="m6 6 12 12M18 6 6 18" /></IconBase>;
}

export function CheckIcon(props) {
  return <IconBase {...props}><path d="m5 12 4 4L19 6" /></IconBase>;
}

export function InfoIcon(props) {
  return <IconBase {...props}><circle cx="12" cy="12" r="9" /><path d="M12 11v5m0-8h.01" /></IconBase>;
}

export function ErrorIcon(props) {
  return <IconBase {...props}><circle cx="12" cy="12" r="9" /><path d="M12 7v6m0 4h.01" /></IconBase>;
}

export function SearchIcon(props) {
  return <IconBase {...props}><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 4 4" /></IconBase>;
}

export function ArrowLeftIcon(props) {
  return <IconBase {...props}><path d="m15 18-6-6 6-6" /><path d="M9 12h11" /></IconBase>;
}

export function DownloadIcon(props) {
  return <IconBase {...props}><path d="M12 4v11m0 0 4-4m-4 4-4-4" /><path d="M5 19h14" /></IconBase>;
}
