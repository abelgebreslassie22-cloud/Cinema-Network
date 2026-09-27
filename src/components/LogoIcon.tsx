import React from 'react';

export default function LogoIcon({ className = "w-10 h-10" }: { className?: string }) {
  return (
    <div className={`relative flex items-center justify-center shrink-0 ${className}`}>
      <svg 
        viewBox="0 0 100 100" 
        className="w-full h-full drop-shadow-[0_2px_8px_rgba(255,140,0,0.3)]"
        fill="none" 
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* The C Body */}
        <path 
          d="M 76 24 
             A 40 40 0 1 0 76 76 
             L 65 65 
             A 25 25 0 1 1 65 35 
             Z" 
          fill="#FF8C00" 
        />
        
        {/* Film Strip Notches on the outer curve of the C */}
        {/* Notch 1: Top-ish */}
        <rect x="32" y="14" width="5" height="8" rx="1.5" transform="rotate(-30 32 14)" fill="#070B14" />
        {/* Notch 2 */}
        <rect x="20" y="24" width="5" height="8" rx="1.5" transform="rotate(-55 20 24)" fill="#070B14" />
        {/* Notch 3: Left-top */}
        <rect x="13" y="38" width="5" height="8" rx="1.5" transform="rotate(-85 13 38)" fill="#070B14" />
        {/* Notch 4: Left-bottom */}
        <rect x="13" y="54" width="5" height="8" rx="1.5" transform="rotate(-105 13 54)" fill="#070B14" />
        {/* Notch 5 */}
        <rect x="20" y="68" width="5" height="8" rx="1.5" transform="rotate(-135 20 68)" fill="#070B14" />
        {/* Notch 6: Bottom-ish */}
        <rect x="32" y="78" width="5" height="8" rx="1.5" transform="rotate(-160 32 78)" fill="#070B14" />

        {/* Play Button inside the C */}
        <path 
          d="M 45 35 
             L 70 50 
             L 45 65 
             Z" 
          fill="#FFA726" 
        />
      </svg>
    </div>
  );
}
