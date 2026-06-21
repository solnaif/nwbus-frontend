export default function LoadingSpinner({ size = 'md' }) {
  const sz = { sm: 'h-5 w-5', md: 'h-8 w-8', lg: 'h-12 w-12' }[size]
  return (
    <div className="flex items-center justify-center min-h-32">
      <div className={`${sz} animate-spin rounded-full border-4 border-nwbus-primary border-t-transparent`} />
    </div>
  )
}
