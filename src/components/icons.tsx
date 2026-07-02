// Tiny inline SVG icons — no icon-font or image dependency. Each inherits the
// current text color (`stroke="currentColor"`) and takes an optional size.

export interface IconProps {
  size?: number
  className?: string
}

const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export const SendIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M22 2 11 13" />
    <path d="M22 2 15 22l-4-9-9-4Z" />
  </svg>
)

export const StopIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
)

export const SpinnerIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={['awr-spin', className].filter(Boolean).join(' ')}>
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
)

export const CheckIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M20 6 9 17l-5-5" />
  </svg>
)

export const AlertIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <path d="M12 9v4" />
    <path d="M12 17h.01" />
  </svg>
)

export const ToolIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z" />
  </svg>
)

export const ChevronIcon = ({ size, className }: IconProps) => (
  <svg {...base(size)} className={className}>
    <path d="m6 9 6 6 6-6" />
  </svg>
)
