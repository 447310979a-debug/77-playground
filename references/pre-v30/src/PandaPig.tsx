export function PandaPig({ lane = 0, className = '' }: { lane?: number; className?: string }) {
  return <svg className={`panda-pig ${className}`} viewBox={`${lane % 3 * 512} ${Math.floor(lane / 3) * 512} 512 512`} aria-hidden="true">
    <image href="/assets/panda-racers-v25.png" width="1536" height="1024" />
  </svg>
}
