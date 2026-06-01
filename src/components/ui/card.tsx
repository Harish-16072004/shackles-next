import * as React from 'react'

export type CardProps = React.HTMLAttributes<HTMLDivElement>

export function Card({ className = '', ...props }: CardProps) {
  const classes = ['rounded-lg border border-gray-200 bg-white text-gray-900 shadow-sm', className]
    .filter(Boolean)
    .join(' ')

  return <div className={classes} {...props} />
}

export function CardHeader({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const classes = ['flex flex-col space-y-1.5 p-6', className].filter(Boolean).join(' ')
  return <div className={classes} {...props} />
}

export function CardTitle({ className = '', ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  const classes = ['text-2xl font-semibold leading-none tracking-tight', className]
    .filter(Boolean)
    .join(' ')
  return <h3 className={classes} {...props} />
}

export function CardDescription({ className = '', ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  const classes = ['text-sm text-gray-500', className].filter(Boolean).join(' ')
  return <p className={classes} {...props} />
}

export function CardContent({ className = '', ...props }: React.HTMLAttributes<HTMLDivElement>) {
  const classes = ['p-6 pt-0', className].filter(Boolean).join(' ')
  return <div className={classes} {...props} />
}
