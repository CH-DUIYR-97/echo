import React from 'react'
import { cn } from '../../lib/utils'

export interface LayoutProps {
  children: React.ReactNode
  className?: string
}

export const Layout: React.FC<LayoutProps> = ({ children, className }) => {
  return (
    <div className={cn('min-h-screen bg-secondary-50 dark:bg-secondary-900', className)}>
      <div className="container mx-auto px-4 py-8">
        {children}
      </div>
    </div>
  )
}

export interface HeaderProps {
  title: string
  subtitle?: string
  children?: React.ReactNode
  className?: string
}

export const Header: React.FC<HeaderProps> = ({ title, subtitle, children, className }) => {
  return (
    <header className={cn('mb-8', className)}>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-secondary-900 dark:text-white">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-2 text-secondary-600 dark:text-secondary-400">
              {subtitle}
            </p>
          )}
        </div>
        {children && (
          <div className="flex items-center space-x-4">
            {children}
          </div>
        )}
      </div>
    </header>
  )
}

export interface SectionProps {
  children: React.ReactNode
  title?: string
  className?: string
}

export const Section: React.FC<SectionProps> = ({ children, title, className }) => {
  return (
    <section className={cn('mb-8', className)}>
      {title && (
        <h2 className="text-xl font-semibold text-secondary-900 dark:text-white mb-4">
          {title}
        </h2>
      )}
      {children}
    </section>
  )
} 