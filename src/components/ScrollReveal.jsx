import React, { useEffect, useRef, useState } from 'react';

/**
 * Wrapper component with parallax + pop effect on room cards
 * Cards move slower than scroll speed and scale up when centered
 */
const ScrollReveal = ({ children, className = '' }) => {
    const ref = useRef(null);
    const [transform, setTransform] = useState({ scale: 1, translateY: 0 });

    useEffect(() => {
        const handleScroll = () => {
            if (!ref.current) return;

            const rect = ref.current.getBoundingClientRect();
            const viewportHeight = window.innerHeight;
            const elementCenter = rect.top + rect.height / 2;
            const viewportCenter = viewportHeight / 2;

            // Calculate how centered the element is (0 = at center, 1 = at edge)
            const distanceFromCenter = Math.abs(elementCenter - viewportCenter) / (viewportHeight / 2);
            const centeredness = 1 - Math.min(distanceFromCenter, 1);

            // Scale: 0.98 at edges, 1.03 at center
            const scale = 0.98 + centeredness * 0.05;

            // Parallax: move cards slightly based on their position relative to viewport
            // Cards above center move down, cards below center move up (slower movement)
            const parallaxOffset = (viewportCenter - elementCenter) * 0.08;

            setTransform({ scale, translateY: parallaxOffset });
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();

        return () => window.removeEventListener('scroll', handleScroll);
    }, []);

    return (
        <div
            ref={ref}
            className={className}
            style={{
                transform: `translateY(${transform.translateY}px) scale(${transform.scale})`,
                transition: 'transform 0.15s ease-out'
            }}
        >
            {children}
        </div>
    );
};

export default ScrollReveal;

