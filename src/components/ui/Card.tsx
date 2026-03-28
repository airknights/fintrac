import { type ReactNode } from 'react'

interface Props {
  title?: string
  children: ReactNode
  className?: string
  action?: ReactNode
}

export default function Card({ title, children, className = '', action }: Props) {
  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-xl ${className}`}>
      {(title || action) && (
        <div className="flex items-center justify-between px-5 pt-5 pb-3">
          {title && <h3 className="text-sm font-medium text-gray-400">{title}</h3>}
          {action}
        </div>
      )}
      <div className={title || action ? 'px-5 pb-5' : 'p-5'}>
        {children}
      </div>
    </div>
  )
}
